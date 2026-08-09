import { getDb } from "../client";
import { newUid, recordTombstone, uidOf } from "../uid";
import { DuplicateError, RaidInUseError, type Raid, type RaidInput } from "../types";

interface RaidRow {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
}

export async function listRaids(options: { onlyActive?: boolean } = {}): Promise<Raid[]> {
  const db = await getDb();
  const where = options.onlyActive ? "WHERE is_active = 1" : "";
  const rows = await db.select<RaidRow[]>(
    `SELECT id, name, is_active, sort_order FROM raids ${where} ORDER BY sort_order, name`,
  );

  return rows.map(toRaid);
}

export async function createRaid(input: RaidInput): Promise<void> {
  const db = await getDb();

  await ensureUnique(input.name, null);

  const [{ next }] = await db.select<{ next: number }[]>(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM raids`,
  );

  await db.execute(
    `INSERT INTO raids (name, is_active, sort_order, uid, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [input.name.trim(), input.isActive ? 1 : 0, next, newUid(), now()],
  );
}

export async function updateRaid(id: number, input: RaidInput): Promise<void> {
  const db = await getDb();

  await ensureUnique(input.name, id);

  await db.execute(`UPDATE raids SET name = ?, is_active = ?, updated_at = ? WHERE id = ?`, [
    input.name.trim(),
    input.isActive ? 1 : 0,
    now(),
    id,
  ]);
}

export async function setRaidActive(id: number, isActive: boolean): Promise<void> {
  const db = await getDb();

  await db.execute(`UPDATE raids SET is_active = ?, updated_at = ? WHERE id = ?`, [
    isActive ? 1 : 0,
    now(),
    id,
  ]);
}

function now(): string {
  return new Date().toISOString();
}

export async function deleteRaid(id: number): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM players WHERE raid_id = ?`,
    [id],
  );

  if (count > 0) throw new RaidInUseError(count);

  await recordTombstone("raid", await uidOf("raids", id));
  await db.execute(`DELETE FROM raids WHERE id = ?`, [id]);
}

async function ensureUnique(name: string, exceptId: number | null): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(`SELECT id FROM raids WHERE name = ?`, [name.trim()]);
  const conflict = rows.find((row) => row.id !== exceptId);

  if (conflict) throw new DuplicateError("Рейд с таким названием уже есть");
}

function toRaid(row: RaidRow): Raid {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}
