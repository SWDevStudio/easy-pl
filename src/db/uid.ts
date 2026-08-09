import { getDb } from "./client";

export function newUid(): string {
  return crypto.randomUUID();
}

export async function recordTombstone(entity: string, uid: string | null): Promise<void> {
  if (!uid) return;

  const db = await getDb();

  await db.execute(`INSERT OR REPLACE INTO tombstones (entity, uid, deleted_at) VALUES (?, ?, ?)`, [
    entity,
    uid,
    new Date().toISOString(),
  ]);
}

export async function uidOf(table: string, id: number): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ uid: string | null }[]>(`SELECT uid FROM ${table} WHERE id = ?`, [id]);

  return rows[0]?.uid ?? null;
}
