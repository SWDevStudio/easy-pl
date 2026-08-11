import {
  draw,
  PriorityOverflowError,
  raidKeyOf,
  type DrawInput,
  type DrawResult,
} from "@/lottery/draw";
import { nextDebt } from "@/lottery/fairness";
import { createSeed } from "@/lottery/random";
import { getDb } from "../client";
import { newUid, recordTombstone, uidOf } from "../uid";
import {
  EventStateError,
  type EventInput,
  type EventParticipant,
  type EventRaidSeats,
  type EventStatus,
  type GuildEvent,
  type RaidQuota,
  type SlotSource,
} from "../types";

const BATCH_SIZE = 100;

export interface DrawOptions {
  seatPriorityOverQuota?: boolean;
}

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
  raid_id: number | null;
  raid_name: string | null;
  is_raid_guest: number;
  debt: number;
  is_favorite: number;
  is_signed_up: number;
  is_priority: number;
  slot_source: SlotSource | null;
  reserve_rank: number | null;
  showed_up: number | null;
}

interface SeatsRow {
  raid_id: number;
  raid_name: string | null;
  slots: number;
  signed_up: number;
  priority: number;
  taken: number;
  occupied: number;
}

const SELECT_SEATS = `
  WITH members AS (
    SELECT s.player_id, COALESCE(s.raid_id, p.raid_id, 0) AS raid_id, s.is_priority
    FROM event_signups s JOIN players p ON p.id = s.player_id
    WHERE s.event_id = ?
  ),
  seated AS (
    SELECT COALESCE(m.raid_id, p.raid_id, 0) AS raid_id, t.reserve_rank,
           COALESCE(a.showed_up, 1) AS showed_up
    FROM event_slots t
    JOIN players p ON p.id = t.player_id
    LEFT JOIN members m ON m.player_id = t.player_id
    LEFT JOIN attendance a ON a.event_id = t.event_id AND a.player_id = t.player_id
    WHERE t.event_id = ?
  ),
  groups AS (
    SELECT raid_id FROM event_quotas WHERE event_id = ?
    UNION SELECT raid_id FROM members
    UNION SELECT raid_id FROM seated
  )
  SELECT g.raid_id, r.name AS raid_name, COALESCE(q.slots, 0) AS slots,
         (SELECT COUNT(*) FROM members m WHERE m.raid_id = g.raid_id) AS signed_up,
         (SELECT COUNT(*) FROM members m
           WHERE m.raid_id = g.raid_id AND m.is_priority = 1) AS priority,
         (SELECT COUNT(*) FROM seated t
           WHERE t.raid_id = g.raid_id AND t.reserve_rank IS NULL) AS taken,
         (SELECT COUNT(*) FROM seated t
           WHERE t.raid_id = g.raid_id AND t.reserve_rank IS NULL AND t.showed_up = 1) AS occupied
  FROM groups g
  LEFT JOIN raids r ON r.id = g.raid_id
  LEFT JOIN event_quotas q ON q.event_id = ? AND q.raid_id = g.raid_id
  ORDER BY g.raid_id = 0, r.sort_order, r.name`;

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
    `SELECT p.id AS player_id, p.family_name, c.display_name AS class_name,
            COALESCE(s.raid_id, p.raid_id) AS raid_id,
            COALESCE(g.name, r.name) AS raid_name,
            CASE WHEN s.raid_id IS NULL THEN 0 ELSE 1 END AS is_raid_guest,
            p.debt, p.is_favorite,
            CASE WHEN s.player_id IS NULL THEN 0 ELSE 1 END AS is_signed_up,
            COALESCE(s.is_priority, 0) AS is_priority,
            t.source AS slot_source, t.reserve_rank, a.showed_up
     FROM players p
     LEFT JOIN classes c ON c.id = p.class_id
     LEFT JOIN raids r ON r.id = p.raid_id
     LEFT JOIN event_signups s ON s.player_id = p.id AND s.event_id = ?
     LEFT JOIN raids g ON g.id = s.raid_id
     LEFT JOIN event_slots t ON t.player_id = p.id AND t.event_id = ?
     LEFT JOIN attendance a ON a.player_id = p.id AND a.event_id = ?
     ORDER BY p.is_favorite DESC, p.family_name`,
    [eventId, eventId, eventId],
  );

  return rows.map(toParticipant);
}

export async function listRaidSeats(eventId: number): Promise<EventRaidSeats[]> {
  const db = await getDb();
  const rows = await db.select<SeatsRow[]>(SELECT_SEATS, sameParam(SELECT_SEATS, eventId));

  return rows.map(toSeats);
}

function sameParam(sql: string, value: number): number[] {
  return Array.from({ length: sql.split("?").length - 1 }, () => value);
}

export async function createEvent(input: EventInput): Promise<number> {
  const db = await getDb();

  await db.execute(
    `INSERT INTO events (title, event_date, slots, reserve_size, updated_at, uid)
     VALUES (?, ?, 0, 0, ?, ?)`,
    [input.title.trim(), input.eventDate, now(), newUid()],
  );

  const rows = await db.select<{ id: number }[]>(`SELECT MAX(id) AS id FROM events`);
  const id = rows[0]?.id ?? 0;

  await replaceQuotas(id, input.quotas);

  return id;
}

export async function updateEvent(id: number, input: EventInput): Promise<void> {
  const db = await getDb();
  const event = await getEvent(id);

  if (event.status === "closed") throw new EventStateError("Закрытое событие нельзя менять");

  await db.execute(`UPDATE events SET title = ?, event_date = ?, updated_at = ? WHERE id = ?`, [
    input.title.trim(),
    input.eventDate,
    now(),
    id,
  ]);

  if (event.status === "draft") await replaceQuotas(id, input.quotas);
}

export async function deleteEvent(id: number): Promise<void> {
  const db = await getDb();

  await recordTombstone("event", await uidOf("events", id));
  await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM event_quotas WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM draw_log WHERE event_id = ?`, [id]);
  await db.execute(`DELETE FROM events WHERE id = ?`, [id]);
}

export async function dropRaidFromEvents(raidId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ event_id: number }[]>(
    `SELECT event_id FROM event_quotas WHERE raid_id = ?
     UNION
     SELECT event_id FROM event_signups WHERE raid_id = ?`,
    [raidId, raidId],
  );

  if (!rows.length) return;

  await db.execute(`DELETE FROM event_quotas WHERE raid_id = ?`, [raidId]);
  await db.execute(`UPDATE event_signups SET raid_id = NULL WHERE raid_id = ?`, [raidId]);

  for (const row of rows) await refreshTotalSlots(row.event_id);
}

export async function setSignup(eventId: number, playerId: number, isSignedUp: boolean): Promise<void> {
  const db = await getDb();

  await ensureDraft(eventId);

  if (!isSignedUp) {
    await db.execute(`DELETE FROM event_signups WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
    await touchEvent(eventId);
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
  await touchEvent(eventId);
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
  await touchEvent(eventId);
}

export async function setSignupRaid(
  eventId: number,
  playerId: number,
  raidId: number | null,
): Promise<void> {
  const db = await getDb();

  await ensureDraft(eventId);

  await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
    eventId,
    playerId,
  ]);
  await db.execute(`UPDATE event_signups SET raid_id = ? WHERE event_id = ? AND player_id = ?`, [
    raidId,
    eventId,
    playerId,
  ]);
  await touchEvent(eventId);
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
  await touchEvent(eventId);
}

export async function runDraw(eventId: number, options: DrawOptions = {}): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status === "closed") throw new EventStateError("Событие закрыто, жребий не переиграть");

  const rows = await db.select<
    { player_id: number; is_priority: number; debt: number; raid_id: number | null }[]
  >(
    `SELECT s.player_id, s.is_priority, p.debt, COALESCE(s.raid_id, p.raid_id) AS raid_id
     FROM event_signups s JOIN players p ON p.id = s.player_id
     WHERE s.event_id = ?
     ORDER BY s.player_id`,
    [eventId],
  );

  if (!rows.length) throw new EventStateError("Никто не заявился на событие");

  const seats = await listRaidSeats(eventId);
  const seatPriorityOverQuota = options.seatPriorityOverQuota === true;
  const hasQuotas = seats.some((group) => group.slots > 0);
  const hasPriority = rows.some((row) => row.is_priority === 1);

  if (!hasQuotas && !(seatPriorityOverQuota && hasPriority)) {
    throw new EventStateError("Ни одному рейду не выделено мест — укажите их в настройках осады");
  }

  const seed = createSeed();
  const result = drawSlots(
    {
      candidates: rows.map((row) => ({
        playerId: row.player_id,
        raidId: row.raid_id,
        debt: row.debt,
        isPriority: row.is_priority === 1,
      })),
      quotas: seats.map((group) => ({ raidId: group.raidId, slots: group.slots })),
      seed,
      seatPriorityOverQuota,
    },
    seats,
  );

  await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [eventId]);
  await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [eventId]);

  for (const batch of chunk(result.main, BATCH_SIZE)) {
    const values = batch.map(() => "(?, ?, ?, NULL)").join(", ");

    await db.execute(
      `INSERT INTO event_slots (event_id, player_id, source, reserve_rank) VALUES ${values}`,
      batch.flatMap((slot) => [eventId, slot.playerId, slot.source]),
    );
  }

  for (const batch of chunk(result.groups, BATCH_SIZE)) {
    const values = batch.map(() => "(?, ?, ?, ?)").join(", ");

    await db.execute(
      `INSERT OR REPLACE INTO event_quotas (event_id, raid_id, slots, share) VALUES ${values}`,
      batch.flatMap((group) => [eventId, raidKeyOf(group.raidId), group.slots, group.share]),
    );
  }

  await db.execute(
    `INSERT OR REPLACE INTO draw_log (event_id, seed, snapshot_json, created_at) VALUES (?, ?, ?, ?)`,
    [eventId, seed, JSON.stringify(result.snapshot), now()],
  );

  await db.execute(`UPDATE events SET seed = ?, share = ?, status = 'drawn', updated_at = ? WHERE id = ?`, [
    seed,
    overallShare(result),
    now(),
    eventId,
  ]);

  await refreshTotalSlots(eventId);
}

function drawSlots(input: DrawInput, seats: EventRaidSeats[]): DrawResult {
  try {
    return draw(input);
  } catch (cause) {
    if (!(cause instanceof PriorityOverflowError)) throw cause;

    const group = seats.find((item) => item.raidId === cause.raidId);

    throw new EventStateError(
      `${whereOf(group?.raidName ?? null)} обязательных игроков ${cause.priorityCount}, а мест ${cause.slots} — подтвердите вывод сверх квоты или переведите лишних в рейд со свободными местами`,
    );
  }
}

function overallShare(result: DrawResult): number {
  const free = result.groups.reduce((sum, group) => sum + Math.max(0, group.slots - group.priority), 0);
  const pool = result.groups.reduce((sum, group) => sum + group.pool, 0);

  if (pool <= 0) return 0;

  return Math.min(1, free / pool);
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
    await touchEvent(eventId);
    return;
  }

  await db.execute(
    `INSERT OR REPLACE INTO attendance (event_id, player_id, showed_up, marked_at) VALUES (?, ?, ?, ?)`,
    [eventId, playerId, showedUp ? 1 : 0, now()],
  );
  await touchEvent(eventId);
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

  if ((already[0]?.count ?? 0) === 0) await ensureFreeSeat(eventId, playerId);

  await db.execute(
    `INSERT OR REPLACE INTO event_slots (event_id, player_id, source, reserve_rank)
     VALUES (?, ?, 'manual', NULL)`,
    [eventId, playerId],
  );
  await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id) VALUES (?, ?)`, [
    eventId,
    playerId,
  ]);
  await touchEvent(eventId);
}

export async function removeFromRoster(eventId: number, playerId: number): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status !== "drawn") throw new EventStateError("Менять состав можно только после жеребьёвки");

  await db.execute(`DELETE FROM attendance WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
  await db.execute(`DELETE FROM event_slots WHERE event_id = ? AND player_id = ?`, [eventId, playerId]);
  await touchEvent(eventId);
}

export async function closeEvent(eventId: number): Promise<void> {
  const db = await getDb();
  const event = await getEvent(eventId);

  if (event.status !== "drawn") throw new EventStateError("Сначала проведите жеребьёвку");

  const rows = await db.select<
    {
      player_id: number;
      debt: number;
      share: number;
      got_slot: number;
      slot_source: string | null;
      showed_up: number | null;
    }[]
  >(
    `SELECT s.player_id, p.debt, COALESCE(q.share, ?) AS share,
            (SELECT COUNT(*) FROM event_slots t
              WHERE t.event_id = s.event_id AND t.player_id = s.player_id) AS got_slot,
            (SELECT t.source FROM event_slots t
              WHERE t.event_id = s.event_id AND t.player_id = s.player_id) AS slot_source,
            (SELECT a.showed_up FROM attendance a
              WHERE a.event_id = s.event_id AND a.player_id = s.player_id) AS showed_up
     FROM event_signups s
     JOIN players p ON p.id = s.player_id
     LEFT JOIN event_quotas q ON q.event_id = s.event_id
       AND q.raid_id = COALESCE(s.raid_id, p.raid_id, 0)
     WHERE s.event_id = ?`,
    [event.share ?? 0, eventId],
  );

  const updates = rows.map((row) => ({
    playerId: row.player_id,
    debt: nextDebt({
      debt: row.debt,
      signedUp: true,
      gotSlot: row.got_slot > 0,
      outsideLottery: row.slot_source === "priority" || row.slot_source === "manual",
      showedUp: row.showed_up === null ? null : row.showed_up === 1,
      share: row.share,
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

async function touchEvent(eventId: number): Promise<void> {
  const db = await getDb();

  await db.execute(`UPDATE events SET updated_at = ? WHERE id = ?`, [now(), eventId]);
}

async function replaceQuotas(eventId: number, quotas: RaidQuota[]): Promise<void> {
  const db = await getDb();
  const rows = mergeQuotas(quotas);

  await db.execute(`DELETE FROM event_quotas WHERE event_id = ?`, [eventId]);

  for (const batch of chunk(rows, BATCH_SIZE)) {
    const values = batch.map(() => "(?, ?, ?)").join(", ");

    await db.execute(
      `INSERT INTO event_quotas (event_id, raid_id, slots) VALUES ${values}`,
      batch.flatMap((quota) => [eventId, quota.raidKey, quota.slots]),
    );
  }

  await refreshTotalSlots(eventId);
}

function mergeQuotas(quotas: RaidQuota[]): { raidKey: number; slots: number }[] {
  const merged = new Map<number, number>();

  for (const quota of quotas) {
    if (!Number.isInteger(quota.slots) || quota.slots < 0) {
      throw new EventStateError("Мест на рейд должно быть целым числом, не меньше нуля");
    }

    if (quota.slots > 0) merged.set(raidKeyOf(quota.raidId), quota.slots);
  }

  return [...merged].map(([raidKey, slots]) => ({ raidKey, slots }));
}

async function refreshTotalSlots(eventId: number): Promise<void> {
  const db = await getDb();

  await db.execute(
    `UPDATE events
     SET slots = (SELECT COALESCE(SUM(slots), 0) FROM event_quotas WHERE event_id = ?),
         updated_at = ?
     WHERE id = ?`,
    [eventId, now(), eventId],
  );
}

async function ensureFreeSeat(eventId: number, playerId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ raid_id: number | null; raid_name: string | null }[]>(
    `SELECT COALESCE(s.raid_id, p.raid_id) AS raid_id, COALESCE(g.name, r.name) AS raid_name
     FROM players p
     LEFT JOIN raids r ON r.id = p.raid_id
     LEFT JOIN event_signups s ON s.event_id = ? AND s.player_id = p.id
     LEFT JOIN raids g ON g.id = s.raid_id
     WHERE p.id = ?`,
    [eventId, playerId],
  );
  const player = rows[0];

  if (!player) throw new EventStateError("Игрок не найден");

  const raidKey = raidKeyOf(player.raid_id);
  const seats = await listRaidSeats(eventId);
  const group = seats.find((item) => raidKeyOf(item.raidId) === raidKey);
  const where = whereOf(player.raid_name);

  if (!group || group.slots === 0) {
    throw new EventStateError(`${where} мест на эту осаду не выделено`);
  }

  if (group.occupied >= group.slots) {
    throw new EventStateError(
      `${where} свободных мест нет (занято ${group.occupied} из ${group.slots}). Сначала отметьте «Нет» тем, кто не пришёл — их места освободятся`,
    );
  }
}

function whereOf(raidName: string | null): string {
  return raidName === null ? "У игроков без рейда" : `В рейде «${raidName}»`;
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

function toSeats(row: SeatsRow): EventRaidSeats {
  return {
    raidId: row.raid_id === 0 ? null : row.raid_id,
    raidName: row.raid_name,
    slots: row.slots,
    signedUp: row.signed_up,
    priority: row.priority,
    taken: row.taken,
    occupied: row.occupied,
  };
}

function toParticipant(row: ParticipantRow): EventParticipant {
  return {
    playerId: row.player_id,
    familyName: row.family_name,
    className: row.class_name,
    raidId: row.raid_id,
    raidName: row.raid_name,
    isRaidGuest: row.is_raid_guest === 1,
    debt: row.debt,
    isFavorite: row.is_favorite === 1,
    isSignedUp: row.is_signed_up === 1,
    isPriority: row.is_priority === 1,
    slotSource: row.slot_source,
    reserveRank: row.reserve_rank,
    showedUp: row.showed_up === null ? null : row.showed_up === 1,
  };
}
