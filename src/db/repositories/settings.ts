import { getDb } from "../client";

export async function readSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(`SELECT key, value FROM settings`);

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function writeSetting(key: string, value: string): Promise<void> {
  const db = await getDb();

  await db.execute(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
}
