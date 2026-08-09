import Database from "@tauri-apps/plugin-sql";
import { runMigrations } from "./migrations";

const DB_URL = "sqlite:easy-pl.db";

export interface Sql {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

let connection: Promise<Sql> | null = null;

export function getDb(): Promise<Sql> {
  connection ??= open();

  return connection;
}

export function useSql(sql: Sql | null): void {
  connection = sql === null ? null : Promise.resolve(sql);
}

async function open(): Promise<Sql> {
  const db = await Database.load(DB_URL);

  await runMigrations(db);

  return db;
}
