import { draw } from "@/lottery/draw";
import { nextDebt } from "@/lottery/fairness";
import { createSeed } from "@/lottery/random";
import { getDb } from "../client";
import { newUid, recordTombstone, uidOf } from "../uid";
import {
  EventStateError,
  type EventInput,
  type EventParticipant,
  type EventStatus,
  type GuildEvent,
  type SlotSource,
} from "../types";

const BATCH_SIZE = 100;

interface EventRow {
  id: number;
  title: string;
  event_date: string;
  slots: number;
  reserve_size: number;
  seed: string | null;
  share: number | null;
  status: EventStatus;
  signed_up: number;
  taken: number;
  attended: number;
}

interface ParticipantRow {
  player_id: number;
  family_name: string;
  class_name: string | null;
  raid_name: string | null;
  debt: number;
  is_favorite: number;
  is_signed_up: number;
  is_priority: number;
  slot_source: SlotSource | null;
  reserve_rank: number | null;
  showed_up: number | null;
}

const SELECT_EVENT = `
  SELECT e.id, e.title, e.event_date, e.slots, e.reserve_size, e.seed, e.share, e.status,
         (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id) AS signed_up,
         (SELECT COUNT(*) FROM event_slots t WHERE t.event_id = e.id AND t.reserve_rank IS NULL) AS taken,
         (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND a.showed_up = 1) AS attended
  FROM events e`;

export async function listEvents(): Promise<GuildEvent[]> {
  const db = await getDb();
  const rows = await db.select<EventRow[]>(`${SELECT_EVENT} ORDER BY e.event_date DESC, e.id DESC`);

  return rows.map(toEvent);
}

export async function getEvent(id: number): Promise<GuildEvent> {
  const db = await getDb();
  const rows = await db.select<EventRow[]>(`${SELECT_EVENT} WHERE e.id = ?`, [id]);
  const row = rows[0];

  if (!row) throw new EventStateError("Событие не найдено");

  return toEvent(row);
}

export async function listParticipants(eventId: number): Promise<EventParticipant[]> {
  const db = await getDb();
  const rows = await db.select<ParticipantRow[]>(
    `SELECT p.id AS player_id, p.family_name, c.display_name AS class_name, r.name AS raid_name,
            p.debt, p.is_favorite,
            CASE WHEN s.player_id IS NULL THEN 0 ELSE 1 END AS is_signed_up,
            COALESCE(s.is_priority, 0) AS is_priority,
            t.source AS slot_source, t.reserve_rank, a.showed_up
     FROM players p
     LEFT JOIN classes c ON c.id = p.class_id
     LEFT JOIN raids r ON r.id = p.raid_id
     LEFT JOIN event_signups s ON s.player_id = p.id AND s.event_id = ?
     LEFT JOIN event_slots t ON t.player_id = p.id AND t.event_id = ?
     LEFT JOIN attendance a ON a.player_id = p.id AND a.event_id = ?
     ORDER BY p.is_favorite DESC, p.family_name`,
    [eventId, eventId, eventId],
  );

  return rows.map(toParticipant);
}

export async function createEvent(input: EventInput): Promise<number> {
  const db = await getDb();

  await db.execute(
    `INSERT INTO events (title, event_date, slots, reserve_size, updated_at, uid)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [input.title.trim(), input.eventDate, input.slots, now(), newUid()],
  );

  const rows = await db.select<{ id: number }[]>(`SELECT MAX(id) AS id FROM events`);

  return rows[0]?.id ?? 0;
}

export async function updateEvent(id: number, input: EventInput): Promise<void> {
  const db = await getDb();
  const event = await getEvent(id);

  if (event.status === "closed") throw new EventStateError("Закрытое событие нельзя менять");

  await db.execute(`UPDATE events SET title = ?, event_date = ?, slots = ?, updated_at = ? WHERE id = ?`, [
    input.title.trim(),
    input.eventDate,
    input.slots,
    now(),
    id,
  ]);
}

export async function deleteEvent(id: number): Promise<void> {
  const db = await getDb();

  await recordTombstone("event", await uidOf("events", id));
  await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM draw_log WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM events WHERE id = ?`, [id]);
}

export async function setSignup(eventId: number, playerId: number, isSignedUp: boolean): Promise<void> {
  const db = await getDb();

  await ensureDraft(eventId);

  if (!isSignedUp) {
    await db.execute(`DELETE FROM event_signups WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
    return;
  }

  await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
    eventId,
    playerId,
  ]);
  await applyFavoritePriority(eventId, playerId);
}

export async function applyFavoritePriority(eventId: number, playerId: number | null): Promise<void> {
  const db = await getDb();
  const filter = playerId === null ? "" : "AND player_id = ?";
  const params = playerId === null ? [eventId] : [eventId, playerId];

  await db.execute(
    `UPDATE event_signups SET is_priority = 1
     WHERE event_id = ? ${filter}
       AND player_id IN (SELECT id FROM players WHERE is_favorite = 1)`,
    params,
  );
}

export async function setPriority(eventId: number, playerId: number, isPriority: boolean): Promise<void> {
  const db = await getDb();

  await ensureDraft(eventId);

  await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
    eventId,
    playerId,
  ]);
  await db.execute(`UPDATE event_signups SET is_priority = ? WHERE event_id = ? AND player_id = ?`, [
    isPriority ? 1 : 0,
    eventId,
    playerId,
  ]);
}

export async function signUpEveryone(eventId: number): Promise<void> {
  const db = await getDb();

  await ensureDraft(eventId);
  await db.execute(
    `INSERT OR IGNORE INTO event_signups (event_id, player_id) SELECT ?, id FROM players`,
    [eventId],
  );
  await applyFavoritePriority(eventId, null);
}

export async function clearSignups(eventId: number): Promise<void> {
  const db = await getDb();

  await ensureDraft(eventId);
  await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [eventId]);
}

export async function runDraw(eventId: number): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status === "closed") throw new EventStateError("Событие закрыто, жребий не переиграть");

  const rows = await db.select<{ player_id: number; is_priority: number; debt: number }[]>(
    `SELECT s.player_id, s.is_priority, p.debt
     FROM event_signups s JOIN players p ON p.id = s.player_id
     WHERE s.event_id = ?
     ORDER BY s.player_id`,
    [eventId],
  );

  if (!rows.length) throw new EventStateError("Никто не заявился на событие");

  const seed = createSeed();
  const result = draw({
    candidates: rows.map((row) => ({
      playerId: row.player_id,
      debt: row.debt,
      isPriority: row.is_priority === 1,
    })),
    slots: event.slots,
    seed,
  });

  await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [eventId]);
  await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [eventId]);

  for (const batch of chunk(result.main, BATCH_SIZE)) {
    const values = batch.map(() => "(?, ?, ?, NULL)").join(", ");

    await db.execute(
      `INSERT INTO event_slots (event_id, player_id, source, reserve_rank) VALUES ${values}`,
      batch.flatMap((slot) => [eventId, slot.playerId, slot.source]),
    );
  }

  await db.execute(
    `INSERT OR REPLACE INTO draw_log (event_id, seed, snapshot_json, created_at) VALUES (?, ?, ?, ?)`,
    [eventId, seed, JSON.stringify(result.snapshot), now()],
  );

  await db.execute(`UPDATE events SET seed = ?, share = ?, status = 'drawn', updated_at = ? WHERE id = ?`, [
    seed,
    result.share,
    now(),
    eventId,
  ]);
}

export async function setAttendance(
  eventId: number,
  playerId: number,
  showedUp: boolean | null,
): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status !== "drawn") throw new EventStateError("Отмечать явку можно только после жеребьёвки");

  if (showedUp === null) {
    await db.execute(`DELETE FROM attendance WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
    return;
  }

  await db.execute(
    `INSERT OR REPLACE INTO attendance (event_id, player_id, showed_up, marked_at) VALUES (?, ?, ?, ?)`,
    [eventId, playerId, showedUp ? 1 : 0, now()],
  );
}

export async function countOccupiedSeats(eventId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ taken: number; no_shows: number }[]>(
    `SELECT
       (SELECT COUNT(*) FROM event_slots t
         WHERE t.event_id = ? AND t.reserve_rank IS NULL) AS taken,
       (SELECT COUNT(*) FROM event_slots t
         JOIN attendance a ON a.event_id = t.event_id AND a.player_id = t.player_id
         WHERE t.event_id = ? AND t.reserve_rank IS NULL AND a.showed_up = 0) AS no_shows`,
    [eventId, eventId],
  );

  return (rows[0]?.taken ?? 0) - (rows[0]?.no_shows ?? 0);
}

export async function addToRoster(eventId: number, playerId: number): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status !== "drawn") throw new EventStateError("Менять состав можно только после жеребьёвки");

  const already = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM event_slots
     WHERE event_id = ? AND player_id = ? AND reserve_rank IS NULL`,
    [eventId, playerId],
  );

  if ((already[0]?.count ?? 0) === 0 && (await countOccupiedSeats(eventId)) >= event.slots) {
    throw new EventStateError(
      `Все ${event.slots} мест заняты. Сначала отметьте «Нет» тем, кто не пришёл — их места освободятся`,
    );
  }

  await db.execute(
    `INSERT OR REPLACE INTO event_slots (event_id, player_id, source, reserve_rank)
     VALUES (?, ?, 'manual', NULL)`,
    [eventId, playerId],
  );
  await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
    eventId,
    playerId,
  ]);
}

export async function removeFromRoster(eventId: number, playerId: number): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status !== "drawn") throw new EventStateError("Менять состав можно только после жеребьёвки");

  await db.execute(`DELETE FROM attendance WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
  await db.execute(`DELETE FROM event_slots WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
}

export async function closeEvent(eventId: number): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status !== "drawn") throw new EventStateError("Сначала проведите жеребьёвку");

  const share = event.share ?? 0;
  const rows = await db.select<
    {
      player_id: number;
      debt: number;
      got_slot: number;
      slot_source: string | null;
      showed_up: number | null;
    }[]
  >(
    `SELECT s.player_id, p.debt,
            (SELECT COUNT(*) FROM event_slots t
              WHERE t.event_id = s.event_id AND t.player_id = s.player_id) AS got_slot,
            (SELECT t.source FROM event_slots t
              WHERE t.event_id = s.event_id AND t.player_id = s.player_id) AS slot_source,
            (SELECT a.showed_up FROM attendance a
              WHERE a.event_id = s.event_id AND a.player_id = s.player_id) AS showed_up
     FROM event_signups s JOIN players p ON p.id = s.player_id
     WHERE s.event_id = ?`,
    [eventId],
  );

  const updates = rows.map((row) => ({
    playerId: row.player_id,
    debt: nextDebt({
      debt: row.debt,
      signedUp: true,
      gotSlot: row.got_slot > 0,
      outsideLottery: row.slot_source === "priority" || row.slot_source === "manual",
      showedUp: row.showed_up === null ? null : row.showed_up === 1,
      share,
    }),
  }));

  for (const batch of chunk(updates, BATCH_SIZE)) {
    const cases = batch.map(() => "WHEN ? THEN ?").join(" ");
    const placeholders = batch.map(() => "?").join(", ");

    await db.execute(
      `UPDATE players
       SET debt = CASE id ${cases} END, updated_at = ?
       WHERE id IN (${placeholders})`,
      [
        ...batch.flatMap((item) => [item.playerId, item.debt]),
        now(),
        ...batch.map((item) => item.playerId),
      ],
    );
  }

  await db.execute(`UPDATE events SET status = 'closed', updated_at = ? WHERE id = ?`, [now(), eventId]);
}

async function ensureDraft(eventId: number): Promise<void> {
  const event = await getEvent(eventId);

  if (event.status !== "draft") throw new EventStateError("Состав можно менять только до жеребьёвки");
}

function chunk<TItem>(items: TItem[], size: number): TItem[][] {
  const batches: TItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function now(): string {
  return new Date().toISOString();
}

function toEvent(row: EventRow): GuildEvent {
  return {
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
    slots: row.slots,
    reserveSize: row.reserve_size,
    seed: row.seed,
    share: row.share,
    status: row.status,
    signedUp: row.signed_up,
    taken: row.taken,
    attended: row.attended,
  };
}

function toParticipant(row: ParticipantRow): EventParticipant {
  return {
    playerId: row.player_id,
    familyName: row.family_name,
    className: row.class_name,
    raidName: row.raid_name,
    debt: row.debt,
    isFavorite: row.is_favorite === 1,
    isSignedUp: row.is_signed_up === 1,
    isPriority: row.is_priority === 1,
    slotSource: row.slot_source,
    reserveRank: row.reserve_rank,
    showedUp: row.showed_up === null ? null : row.showed_up === 1,
  };
}
