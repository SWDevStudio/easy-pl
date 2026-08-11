import type { Sql } from "@/db/client";
import { LEGACY_STAMP } from "@/db/migrations";
import { NO_RAID } from "@/lottery/draw";
import {
  APPLY_ORDER,
  hasField,
  readArray,
  readBoolean,
  readNumber,
  readString,
  type ApplyResult,
  type Change,
} from "./types";

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

interface QuotaRow {
  raid_uid: string | null;
  slots: number;
  share: number | null;
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
    ...classes.map((row) => toChange("class", row.uid, stamp(row.updated_at), classData(row))),
    ...raids.map((row) => toChange("raid", row.uid, stamp(row.updated_at), raidData(row))),
    ...players.map((row) => toChange("player", row.uid, stamp(row.updated_at), playerData(row))),
  ];

  for (const event of events) {
    changes.push(toChange("event", event.uid, stamp(event.updated_at), await eventData(db, event)));
  }

  const tombstones = await db.select<{ entity: string; uid: string; deleted_at: string }[]>(
    `SELECT entity, uid, deleted_at FROM tombstones ${since === null ? "" : "WHERE deleted_at > ?"}`,
    params,
  );

  for (const row of tombstones) {
    if (!isEntity(row.entity)) continue;

    changes.push({
      entity: row.entity,
      uid: row.uid,
      updatedAt: stamp(row.deleted_at),
      deleted: true,
      data: null,
    });
  }

  return changes;
}

type Outcome = "applied" | "skipped" | "failed" | "deferred";

export async function applyChanges(db: Sql, changes: Change[]): Promise<ApplyResult> {
  const outcomes = new Map<Change, Outcome>();

  for (const entity of APPLY_ORDER) {
    for (const change of changes.filter((item) => item.entity === entity)) {
      outcomes.set(change, await applyChange(db, change));
    }
  }

  const counted = [...outcomes.values()];

  return {
    applied: counted.filter((outcome) => outcome === "applied").length,
    failed: counted.filter((outcome) => outcome === "failed").length,
    deferred: counted.filter((outcome) => outcome === "deferred").length,
    cursor: safeCursor(changes, outcomes),
  };
}

function safeCursor(changes: Change[], outcomes: Map<Change, Outcome>): number | null {
  const revisions = changes.flatMap((change) =>
    typeof change.revision === "number" ? [{ change, revision: change.revision }] : [],
  );

  if (!revisions.length) return null;

  const stuck = revisions
    .filter((item) => {
      const outcome = outcomes.get(item.change);

      return outcome === "failed" || outcome === "deferred";
    })
    .map((item) => item.revision);

  const floor = stuck.length ? Math.min(...stuck) : Number.POSITIVE_INFINITY;
  const safe = revisions.filter((item) => item.revision < floor).map((item) => item.revision);

  return safe.length ? Math.max(...safe) : null;
}

async function applyChange(db: Sql, change: Change): Promise<Outcome> {
  try {
    return await applyOne(db, change);
  } catch {
    return "failed";
  }
}

async function applyOne(db: Sql, change: Change): Promise<Outcome> {
  const table = tableOf(change.entity);
  const existing = await db.select<{ id: number; updated_at: string }[]>(
    `SELECT id, updated_at FROM ${table} WHERE uid = ?`,
    [change.uid],
  );
  const own = existing[0];

  if (!own) {
    const buriedAt = await tombstoneAt(db, change.entity, change.uid);

    if (buriedAt !== null && buriedAt >= change.updatedAt) return "skipped";
  }

  const local = own ?? (await findByNaturalKey(db, change));

  if (local && local.updated_at >= change.updatedAt) return "skipped";

  if (change.deleted) {
    await buryLocal(db, change.entity, change.uid, change.updatedAt);

    if (!local) return "skipped";

    await removeLocal(db, change.entity, local.id);

    return "applied";
  }

  if (change.data === null) return "skipped";

  if (!own && local) await adopt(db, change, local.id);

  return upsert(db, change, local?.id ?? null);
}

async function upsert(db: Sql, change: Change, localId: number | null): Promise<Outcome> {
  if (change.entity === "class") {
    await upsertClass(db, change, localId);
    return "applied";
  }

  if (change.entity === "raid") {
    await upsertRaid(db, change, localId);
    return "applied";
  }

  if (change.entity === "player") {
    await upsertPlayer(db, change, localId);
    return "applied";
  }

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

async function upsertEvent(db: Sql, change: Change, localId: number | null): Promise<Outcome> {
  const roster = await resolveRoster(db, change);
  const stamp = roster.complete ? change.updatedAt : await previousStamp(db, localId);
  const values = [
    readString(change.data, "title") ?? "",
    readString(change.data, "eventDate") ?? "",
    readNumber(change.data, "slots") ?? 0,
    readString(change.data, "seed"),
    readNumber(change.data, "share"),
    readString(change.data, "status") ?? "draft",
    stamp,
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

  if (eventId === undefined) return "failed";

  await replaceChildren(db, eventId, roster);

  return roster.complete ? "applied" : "deferred";
}

interface ResolvedRoster {
  complete: boolean;
  hasQuotas: boolean;
  quotas: { raidId: number; slots: number; share: number | null }[];
  signups: { playerId: number; isPriority: boolean; raidId: number | null }[];
  slots: { playerId: number; source: string }[];
  attendance: { playerId: number; showedUp: boolean; markedAt: string }[];
}

async function resolveRoster(db: Sql, change: Change): Promise<ResolvedRoster> {
  const resolved: ResolvedRoster = {
    complete: true,
    hasQuotas: hasField(change.data, "quotas"),
    quotas: [],
    signups: [],
    slots: [],
    attendance: [],
  };

  for (const raw of readArray(change.data, "quotas")) {
    const raidId = await resolveRaid(db, raw, resolved);
    if (raidId === null) continue;

    resolved.quotas.push({
      raidId,
      slots: readNumber(raw, "slots") ?? 0,
      share: readNumber(raw, "share"),
    });
  }

  for (const raw of readArray(change.data, "signups")) {
    const playerId = await resolvePlayer(db, raw, resolved);
    if (playerId === null) continue;

    resolved.signups.push({
      playerId,
      isPriority: readBoolean(raw, "isPriority"),
      raidId: await resolveSignupRaid(db, raw, resolved),
    });
  }

  for (const raw of readArray(change.data, "roster")) {
    const playerId = await resolvePlayer(db, raw, resolved);
    if (playerId === null) continue;

    resolved.slots.push({ playerId, source: readString(raw, "source") ?? "lottery" });
  }

  for (const raw of readArray(change.data, "attendance")) {
    const playerId = await resolvePlayer(db, raw, resolved);
    if (playerId === null) continue;

    resolved.attendance.push({
      playerId,
      showedUp: readBoolean(raw, "showedUp"),
      markedAt: readString(raw, "markedAt") ?? "",
    });
  }

  return resolved;
}

async function resolvePlayer(db: Sql, raw: unknown, resolved: ResolvedRoster): Promise<number | null> {
  const uid = readString(raw, "playerUid");
  const playerId = await idByUid(db, "players", uid);

  if (playerId !== null) return playerId;
  if (uid !== null && (await tombstoneAt(db, "player", uid)) === null) resolved.complete = false;

  return null;
}

async function resolveRaid(db: Sql, raw: unknown, resolved: ResolvedRoster): Promise<number | null> {
  const uid = readString(raw, "raidUid");

  if (uid === null) return NO_RAID;

  const raidId = await idByUid(db, "raids", uid);

  if (raidId !== null) return raidId;
  if ((await tombstoneAt(db, "raid", uid)) === null) resolved.complete = false;

  return null;
}

async function resolveSignupRaid(db: Sql, raw: unknown, resolved: ResolvedRoster): Promise<number | null> {
  const uid = readString(raw, "raidUid");

  if (uid === null) return null;

  const raidId = await idByUid(db, "raids", uid);

  if (raidId !== null) return raidId;
  if ((await tombstoneAt(db, "raid", uid)) === null) resolved.complete = false;

  return null;
}

async function previousStamp(db: Sql, localId: number | null): Promise<string> {
  if (localId === null) return LEGACY_STAMP;

  const rows = await db.select<{ updated_at: string }[]>(`SELECT updated_at FROM events WHERE id = ?`, [
    localId,
  ]);

  return rows[0]?.updated_at ?? LEGACY_STAMP;
}

async function replaceChildren(db: Sql, eventId: number, roster: ResolvedRoster): Promise<void> {
  await replaceQuotas(db, eventId, roster);
  await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [eventId]);
  await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [eventId]);
  await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [eventId]);

  for (const item of roster.signups) {
    await db.execute(
      `INSERT OR IGNORE INTO event_signups (event_id, player_id, is_priority, raid_id)
       VALUES (?, ?, ?, ?)`,
      [eventId, item.playerId, item.isPriority ? 1 : 0, item.raidId],
    );
  }

  for (const item of roster.slots) {
    await db.execute(
      `INSERT OR IGNORE INTO event_slots (event_id, player_id, source, reserve_rank) VALUES (?, ?, ?, NULL)`,
      [eventId, item.playerId, item.source],
    );
  }

  for (const item of roster.attendance) {
    await db.execute(
      `INSERT OR IGNORE INTO attendance (event_id, player_id, showed_up, marked_at) VALUES (?, ?, ?, ?)`,
      [eventId, item.playerId, item.showedUp ? 1 : 0, item.markedAt],
    );
  }
}

async function replaceQuotas(db: Sql, eventId: number, roster: ResolvedRoster): Promise<void> {
  if (!roster.hasQuotas) return legacyQuota(db, eventId);

  await db.execute(`DELETE FROM event_quotas WHERE event_id = ?`, [eventId]);

  for (const item of roster.quotas) {
    await db.execute(
      `INSERT OR REPLACE INTO event_quotas (event_id, raid_id, slots, share) VALUES (?, ?, ?, ?)`,
      [eventId, item.raidId, item.slots, item.share],
    );
  }
}

async function legacyQuota(db: Sql, eventId: number): Promise<void> {
  const rows = await db.select<{ slots: number; quotas: number }[]>(
    `SELECT e.slots, (SELECT COUNT(*) FROM event_quotas q WHERE q.event_id = e.id) AS quotas
     FROM events e WHERE e.id = ?`,
    [eventId],
  );
  const row = rows[0];

  if (!row || row.quotas > 0 || row.slots <= 0) return;

  await db.execute(`INSERT OR REPLACE INTO event_quotas (event_id, raid_id, slots) VALUES (?, ?, ?)`, [
    eventId,
    NO_RAID,
    row.slots,
  ]);
}

async function removeLocal(db: Sql, entity: Change["entity"], localId: number): Promise<void> {
  if (entity === "event") {
    await db.execute(`DELETE FROM attendance WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_slots WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_signups WHERE event_id = ?`, [localId]);
    await db.execute(`DELETE FROM event_quotas WHERE event_id = ?`, [localId]);
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

  if (entity === "raid") {
    await db.execute(`DELETE FROM event_quotas WHERE raid_id = ?`, [localId]);
    await db.execute(`UPDATE event_signups SET raid_id = NULL WHERE raid_id = ?`, [localId]);
    await db.execute(`DELETE FROM raids WHERE id = ?`, [localId]);
    return;
  }

  await db.execute(`DELETE FROM ${tableOf(entity)} WHERE id = ?`, [localId]);
}

async function findByNaturalKey(
  db: Sql,
  change: Change,
): Promise<{ id: number; updated_at: string } | undefined> {
  if (change.deleted || change.data === null) return undefined;

  const lookup = naturalKeyLookup(change);

  if (lookup === null) return undefined;

  const rows = await db.select<{ id: number; updated_at: string }[]>(lookup.sql, lookup.params);

  return rows[0];
}

async function adopt(db: Sql, change: Change, localId: number): Promise<void> {
  const table = tableOf(change.entity);
  const rows = await db.select<{ uid: string | null }[]>(`SELECT uid FROM ${table} WHERE id = ?`, [localId]);
  const abandoned = rows[0]?.uid;

  await db.execute(`UPDATE ${table} SET uid = ? WHERE id = ?`, [change.uid, localId]);

  if (!abandoned || abandoned === change.uid) return;

  await db.execute(`INSERT OR REPLACE INTO uid_aliases (entity, old_uid, new_uid) VALUES (?, ?, ?)`, [
    change.entity,
    abandoned,
    change.uid,
  ]);
}

async function tombstoneAt(db: Sql, entity: string, uid: string): Promise<string | null> {
  const rows = await db.select<{ deleted_at: string }[]>(
    `SELECT deleted_at FROM tombstones WHERE entity = ? AND uid = ?`,
    [entity, uid],
  );

  return rows[0]?.deleted_at ?? null;
}

async function buryLocal(db: Sql, entity: string, uid: string, deletedAt: string): Promise<void> {
  await db.execute(`INSERT OR REPLACE INTO tombstones (entity, uid, deleted_at) VALUES (?, ?, ?)`, [
    entity,
    uid,
    deletedAt,
  ]);
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

  const rows = await db.select<{ id: number }[]>(
    `SELECT id FROM ${table}
     WHERE uid = ?
        OR uid = (SELECT new_uid FROM uid_aliases WHERE old_uid = ?)`,
    [uid, uid],
  );

  return rows[0]?.id ?? null;
}

function tableOf(entity: Change["entity"]): string {
  if (entity === "class") return "classes";
  if (entity === "raid") return "raids";
  if (entity === "player") return "players";

  return "events";
}

const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function stamp(value: string | null): string {
  return value !== null && ISO_STAMP.test(value) ? value : LEGACY_STAMP;
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
    `SELECT p.uid AS player_uid, s.is_priority AS a, g.uid AS b
     FROM event_signups s
     JOIN players p ON p.id = s.player_id
     LEFT JOIN raids g ON g.id = s.raid_id
     WHERE s.event_id = ?`,
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

  const quotas = await db.select<QuotaRow[]>(
    `SELECT r.uid AS raid_uid, q.slots, q.share
     FROM event_quotas q LEFT JOIN raids r ON r.id = q.raid_id
     WHERE q.event_id = ? AND (q.raid_id = 0 OR r.id IS NOT NULL)`,
    [row.id],
  );

  return {
    title: row.title,
    eventDate: row.event_date,
    slots: row.slots,
    seed: row.seed,
    share: row.share,
    status: row.status,
    quotas: quotas.map((item) => ({ raidUid: item.raid_uid, slots: item.slots, share: item.share })),
    signups: signups.map((item) => ({
      playerUid: item.player_uid,
      isPriority: item.a === 1,
      raidUid: item.b,
    })),
    roster: roster.map((item) => ({ playerUid: item.player_uid, source: item.b })),
    attendance: attendance.map((item) => ({
      playerUid: item.player_uid,
      showedUp: item.a === 1,
      markedAt: item.b,
    })),
  };
}
