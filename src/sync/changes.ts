import type { Sql } from "@/db/client";
import { APPLY_ORDER, readArray, readBoolean, readNumber, readString, type Change } from "./types";

interface ClassRow {
  uid: string;
  base_name: string;
  path: string;
  display_name: string;
  is_active: number;
  sort_order: number;
  updated_at: string;
}

interface RaidRow {
  uid: string;
  name: string;
  is_active: number;
  sort_order: number;
  updated_at: string;
}

interface PlayerRow {
  uid: string;
  family_name: string;
  class_uid: string | null;
  raid_uid: string | null;
  discord: string | null;
  discord_id: string | null;
  joined_at: string;
  debt: number;
  is_favorite: number;
  note: string | null;
  updated_at: string;
}

interface EventRow {
  id: number;
  uid: string;
  title: string;
  event_date: string;
  slots: number;
  seed: string | null;
  share: number | null;
  status: string;
  updated_at: string;
}

interface ChildRow {
  event_uid: string;
  player_uid: string;
  a: number | null;
  b: string | null;
}

export async function collectChanges(db: Sql, since: string | null): Promise<Change[]> {
  const filter = since === null ? "" : "WHERE updated_at > ?";
  const params = since === null ? [] : [since];

  const classes = await db.select<ClassRow[]>(
    `SELECT uid, base_name, path, display_name, is_active, sort_order, updated_at FROM classes ${filter}`,
    params,
  );

  const raids = await db.select<RaidRow[]>(
    `SELECT uid, name, is_active, sort_order, updated_at FROM raids ${filter}`,
    params,
  );

  const players = await db.select<PlayerRow[]>(
    `SELECT p.uid, p.family_name, c.uid AS class_uid, r.uid AS raid_uid, p.discord, p.discord_id,
            p.joined_at, p.debt, p.is_favorite, p.note, p.updated_at
     FROM players p
     LEFT JOIN classes c ON c.id = p.class_id
     LEFT JOIN raids r ON r.id = p.raid_id
     ${since === null ? "" : "WHERE p.updated_at > ?"}`,
    params,
  );

  const events = await db.select<EventRow[]>(
    `SELECT id, uid, title, event_date, slots, seed, share, status, updated_at FROM events ${filter}`,
    params,
  );

  const changes: Change[] = [
    ...classes.map((row) => toChange("class", row.uid, row.updated_at, classData(row))),
    ...raids.map((row) => toChange("raid", row.uid, row.updated_at, raidData(row))),
    ...players.map((row) => toChange("player", row.uid, row.updated_at, playerData(row))),
  ];

  for (const event of events) {
    changes.push(toChange("event", event.uid, event.updated_at, await eventData(db, event)));
  }

  const tombstones = await db.select<{ entity: string; uid: string; deleted_at: string }[]>(
    `SELECT entity, uid, deleted_at FROM tombstones ${since === null ? "" : "WHERE deleted_at > ?"}`,
    params,
  );

  for (const row of tombstones) {
    if (!isEntity(row.entity)) continue;

    changes.push({ entity: row.entity, uid: row.uid, updatedAt: row.deleted_at, deleted: true, data: null });
  }

  return changes;
}

export async function applyChanges(db: Sql, changes: Change[]): Promise<number> {
  let applied = 0;

  for (const entity of APPLY_ORDER) {
    for (const change of changes.filter((item) => item.entity === entity)) {
      if (await applyChange(db, change)) applied += 1;
    }
  }

  return applied;
}

async function applyChange(db: Sql, change: Change): Promise<boolean> {
  const table = tableOf(change.entity);
  const existing = await db.select<{ id: number; updated_at: string }[]>(
    `SELECT id, updated_at FROM ${table} WHERE uid = ?`,
    [change.uid],
  );
  const local = existing[0] ?? (await adoptByNaturalKey(db, change));

  if (local && local.updated_at >= change.updatedAt) return false;

  if (change.deleted) {
    if (!local) return false;

    await removeLocal(db, change.entity, local.id);

    return true;
  }

  if (change.data === null) return false;

  await upsert(db, change, local?.id ?? null);

  return true;
}

async function upsert(db: Sql, change: Change, localId: number | null): Promise<void> {
  if (change.entity === "class") return upsertClass(db, change, localId);
  if (change.entity === "raid") return upsertRaid(db, change, localId);
  if (change.entity === "player") return upsertPlayer(db, change, localId);

  return upsertEvent(db, change, localId);
}

async function upsertClass(db: Sql, change: Change, localId: number | null): Promise<void> {
  const values = [
    readString(change.data, "baseName") ?? "",
    readString(change.data, "path") ?? "succession",
    readString(change.data, "displayName") ?? "",
    readBoolean(change.data, "isActive") ? 1 : 0,
    readNumber(change.data, "sortOrder") ?? 0,
    change.updatedAt,
  ];

  if (localId === null) {
    await db.execute(
      `INSERT INTO classes (base_name, path, display_name, is_active, sort_order, updated_at, uid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [...values, change.uid],
    );
    return;
  }

  await db.execute(
    `UPDATE classes SET base_name = ?, path = ?, display_name = ?, is_active = ?, sort_order = ?,
            updated_at = ? WHERE id = ?`,
    [...values, localId],
  );
}

async function upsertRaid(db: Sql, change: Change, localId: number | null): Promise<void> {
  const values = [
    readString(change.data, "name") ?? "",
    readBoolean(change.data, "isActive") ? 1 : 0,
    readNumber(change.data, "sortOrder") ?? 0,
    change.updatedAt,
  ];

  if (localId === null) {
    await db.execute(
      `INSERT INTO raids (name, is_active, sort_order, updated_at, uid) VALUES (?, ?, ?, ?, ?)`,
      [...values, change.uid],
    );
    return;
  }

  await db.execute(`UPDATE raids SET name = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`, [
    ...values,
    localId,
  ]);
}

async function upsertPlayer(db: Sql, change: Change, localId: number | null): Promise<void> {
  const classId = await idByUid(db, "classes", readString(change.data, "classUid"));
  const raidId = await idByUid(db, "raids", readString(change.data, "raidUid"));

  const values = [
    readString(change.data, "familyName") ?? "",
    classId,
    raidId,
    readString(change.data, "discord"),
    readString(change.data, "discordId"),
    readString(change.data, "joinedAt") ?? "",
    readNumber(change.data, "debt") ?? 0,
    readBoolean(change.data, "isFavorite") ? 1 : 0,
    readString(change.data, "note"),
    change.updatedAt,
  ];

  if (localId === null) {
    await db.execute(
      `INSERT INTO players (family_name, class_id, raid_id, discord, discord_id, joined_at, debt,
                            is_favorite, note, updated_at, uid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, change.uid],
    );
    return;
  }

  await db.execute(
    `UPDATE players SET family_name = ?, class_id = ?, raid_id = ?, discord = ?, discord_id = ?,
            joined_at = ?, debt = ?, is_favorite = ?, note = ?, updated_at = ? WHERE id = ?`,
    [...values, localId],
  );
}

async function upsertEvent(db: Sql, change: Change, localId: number | null): Promise<void> {
  const values = [
    readString(change.data, "title") ?? "",
    readString(change.data, "eventDate") ?? "",
    readNumber(change.data, "slots") ?? 0,
    readString(change.data, "seed"),
    readNumber(change.data, "share"),
    readString(change.data, "status") ?? "draft",
    change.updatedAt,
  ];

  if (localId === null) {
    await db.execute(
      `INSERT INTO events (title, event_date, slots, seed, share, status, updated_at, uid, reserve_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [...values, change.uid],
    );
  } else {
    await db.execute(
      `UPDATE events SET title = ?, event_date = ?, slots = ?, seed = ?, share = ?, status = ?,
              updated_at = ? WHERE id = ?`,
      [...values, localId],
    );
  }

  const rows = await db.select<{ id: number }[]>(`SELECT id FROM events WHERE uid = ?`, [change.uid]);
  const eventId = rows[0]?.id;

  if (eventId === undefined) return;

  await replaceChildren(db, eventId, change);
}

async function replaceChildren(db: Sql, eventId: number, change: Change): Promise<void> {
  await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [eventId]);
  await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [eventId]);
  await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [eventId]);

  for (const raw of readArray(change.data, "signups")) {
    const playerId = await idByUid(db, "players", readString(raw, "playerUid"));
    if (playerId === null) continue;

    await db.execute(`INSERT OR IGNORE INTO event_signups (event_id, player_id, is_priority) VALUES (?, ?, ?)`, [
      eventId,
      playerId,
      readBoolean(raw, "isPriority") ? 1 : 0,
    ]);
  }

  for (const raw of readArray(change.data, "roster")) {
    const playerId = await idByUid(db, "players", readString(raw, "playerUid"));
    if (playerId === null) continue;

    await db.execute(
      `INSERT OR IGNORE INTO event_slots (event_id, player_id, source, reserve_rank) VALUES (?, ?, ?, NULL)`,
      [eventId, playerId, readString(raw, "source") ?? "lottery"],
    );
  }

  for (const raw of readArray(change.data, "attendance")) {
    const playerId = await idByUid(db, "players", readString(raw, "playerUid"));
    if (playerId === null) continue;

    await db.execute(
      `INSERT OR IGNORE INTO attendance (event_id, player_id, showed_up, marked_at) VALUES (?, ?, ?, ?)`,
      [eventId, playerId, readBoolean(raw, "showedUp") ? 1 : 0, readString(raw, "markedAt") ?? ""],
    );
  }
}

async function removeLocal(db: Sql, entity: Change["entity"], localId: number): Promise<void> {
  if (entity === "event") {
    await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM draw_log WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM events WHERE id = ?`, [localId]);
    return;
  }

  if (entity === "player") {
    await db.execute(`DELETE FROM attendance WHERE player_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_slots WHERE player_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_signups WHERE player_id = ?`, [localId]);
    await db.execute(`DELETE FROM players WHERE id = ?`, [localId]);
    return;
  }

  await db.execute(`DELETE FROM ${tableOf(entity)} WHERE id = ?`, [localId]);
}

async function adoptByNaturalKey(
  db: Sql,
  change: Change,
): Promise<{ id: number; updated_at: string } | undefined> {
  if (change.deleted || change.data === null) return undefined;

  const lookup = naturalKeyLookup(change);

  if (lookup === null) return undefined;

  const rows = await db.select<{ id: number; updated_at: string }[]>(lookup.sql, lookup.params);
  const found = rows[0];

  if (!found) return undefined;

  await db.execute(`UPDATE ${tableOf(change.entity)} SET uid = ? WHERE id = ?`, [change.uid, found.id]);

  return found;
}

function naturalKeyLookup(change: Change): { sql: string; params: unknown[] } | null {
  if (change.entity === "class") {
    return {
      sql: `SELECT id, updated_at FROM classes WHERE base_name = ? AND path = ?`,
      params: [readString(change.data, "baseName") ?? "", readString(change.data, "path") ?? ""],
    };
  }

  if (change.entity === "raid") {
    return {
      sql: `SELECT id, updated_at FROM raids WHERE name = ?`,
      params: [readString(change.data, "name") ?? ""],
    };
  }

  if (change.entity === "player") {
    return {
      sql: `SELECT id, updated_at FROM players WHERE family_name = ?`,
      params: [readString(change.data, "familyName") ?? ""],
    };
  }

  return null;
}

async function idByUid(db: Sql, table: string, uid: string | null): Promise<number | null> {
  if (uid === null) return null;

  const rows = await db.select<{ id: number }[]>(`SELECT id FROM ${table} WHERE uid = ?`, [uid]);

  return rows[0]?.id ?? null;
}

function tableOf(entity: Change["entity"]): string {
  if (entity === "class") return "classes";
  if (entity === "raid") return "raids";
  if (entity === "player") return "players";

  return "events";
}

function isEntity(value: string): value is Change["entity"] {
  return value === "class" || value === "raid" || value === "player" || value === "event";
}

function toChange(
  entity: Change["entity"],
  uid: string,
  updatedAt: string,
  data: Record<string, unknown>,
): Change {
  return { entity, uid, updatedAt, deleted: false, data };
}

function classData(row: ClassRow): Record<string, unknown> {
  return {
    baseName: row.base_name,
    path: row.path,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}

function raidData(row: RaidRow): Record<string, unknown> {
  return { name: row.name, isActive: row.is_active === 1, sortOrder: row.sort_order };
}

function playerData(row: PlayerRow): Record<string, unknown> {
  return {
    familyName: row.family_name,
    classUid: row.class_uid,
    raidUid: row.raid_uid,
    discord: row.discord,
    discordId: row.discord_id,
    joinedAt: row.joined_at,
    debt: row.debt,
    isFavorite: row.is_favorite === 1,
    note: row.note,
  };
}

async function eventData(db: Sql, row: EventRow): Promise<Record<string, unknown>> {
  const signups = await db.select<ChildRow[]>(
    `SELECT p.uid AS player_uid, s.is_priority AS a, NULL AS b
     FROM event_signups s JOIN players p ON p.id = s.player_id WHERE s.event_id = ?`,
    [row.id],
  );

  const roster = await db.select<ChildRow[]>(
    `SELECT p.uid AS player_uid, NULL AS a, t.source AS b
     FROM event_slots t JOIN players p ON p.id = t.player_id WHERE t.event_id = ?`,
    [row.id],
  );

  const attendance = await db.select<ChildRow[]>(
    `SELECT p.uid AS player_uid, a.showed_up AS a, a.marked_at AS b
     FROM attendance a JOIN players p ON p.id = a.player_id WHERE a.event_id = ?`,
    [row.id],
  );

  return {
    title: row.title,
    eventDate: row.event_date,
    slots: row.slots,
    seed: row.seed,
    share: row.share,
    status: row.status,
    signups: signups.map((item) => ({ playerUid: item.player_uid, isPriority: item.a === 1 })),
    roster: roster.map((item) => ({ playerUid: item.player_uid, source: item.b })),
    attendance: attendance.map((item) => ({
      playerUid: item.player_uid,
      showedUp: item.a === 1,
      markedAt: item.b,
    })),
  };
}
