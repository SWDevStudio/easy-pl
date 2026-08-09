import { getDb } from "../client";
import { newUid, recordTombstone, uidOf } from "../uid";
import { ClassInUseError, DuplicateError, type ClassPath, type GameClass, type GameClassInput } from "../types";

interface ClassRow {
  id: number;
  base_name: string;
  path: ClassPath;
  display_name: string;
  is_active: number;
  sort_order: number;
}

const PATH_LABEL: Record<ClassPath, string> = {
  succession: "Традиция",
  awakening: "Пробуждение",
  liberation: "Освобождение",
  none: "",
};

export function buildDisplayName(baseName: string, path: ClassPath): string {
  const trimmed = baseName.trim();

  return path === "none" ? trimmed : `${trimmed} (${PATH_LABEL[path]})`;
}

export async function listClasses(options: { onlyActive?: boolean } = {}): Promise<GameClass[]> {
  const db = await getDb();
  const where = options.onlyActive ? "WHERE is_active = 1" : "";
  const rows = await db.select<ClassRow[]>(
    `SELECT id, base_name, path, display_name, is_active, sort_order
     FROM classes ${where}
     ORDER BY sort_order, base_name, path`,
  );

  return rows.map(toGameClass);
}

export async function createClass(input: GameClassInput): Promise<void> {
  const db = await getDb();
  const displayName = input.displayName.trim() || buildDisplayName(input.baseName, input.path);

  await ensureUnique(input.baseName, input.path, null);

  const [{ next }] = await db.select<{ next: number }[]>(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM classes`,
  );

  await db.execute(
    `INSERT INTO classes (base_name, path, display_name, is_active, sort_order, uid, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.baseName.trim(), input.path, displayName, input.isActive ? 1 : 0, next, newUid(), now()],
  );
}

export async function updateClass(id: number, input: GameClassInput): Promise<void> {
  const db = await getDb();
  const displayName = input.displayName.trim() || buildDisplayName(input.baseName, input.path);

  await ensureUnique(input.baseName, input.path, id);

  await db.execute(
    `UPDATE classes SET base_name = ?, path = ?, display_name = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    [input.baseName.trim(), input.path, displayName, input.isActive ? 1 : 0, now(), id],
  );
}

export async function setClassActive(id: number, isActive: boolean): Promise<void> {
  const db = await getDb();

  await db.execute(`UPDATE classes SET is_active = ?, updated_at = ? WHERE id = ?`, [
    isActive ? 1 : 0,
    now(),
    id,
  ]);
}

function now(): string {
  return new Date().toISOString();
}

export async function deleteClass(id: number): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM players WHERE class_id = ?`,
    [id],
  );

  if (count > 0) throw new ClassInUseError(count);

  await recordTombstone("class", await uidOf("classes", id));
  await db.execute(`DELETE FROM classes WHERE id = ?`, [id]);
}

async function ensureUnique(baseName: string, path: ClassPath, exceptId: number | null): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    `SELECT id FROM classes WHERE base_name = ? AND path = ?`,
    [baseName.trim(), path],
  );
  const conflict = rows.find((row) => row.id !== exceptId);

  if (conflict) throw new DuplicateError("Такой класс уже есть");
}

function toGameClass(row: ClassRow): GameClass {
  return {
    id: row.id,
    baseName: row.base_name,
    path: row.path,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}
