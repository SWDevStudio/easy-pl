import { getDb } from "@/db/client";
import { readSettings, writeSetting } from "@/db/repositories/settings";
import * as service from "@/services/sync";
import { applyChanges, collectChanges } from "./changes";
import type { SyncReport } from "./types";

export const URL_KEY = "sync.url";
const REVISION_KEY = "sync.revision";
const SYNCED_AT_KEY = "sync.syncedAt";

export interface SyncSettings {
  url: string;
  revision: number;
  syncedAt: string | null;
}

export async function readSyncSettings(): Promise<SyncSettings> {
  const settings = await readSettings();
  const revision = Number(settings[REVISION_KEY] ?? "0");

  return {
    url: settings[URL_KEY] ?? "",
    revision: Number.isFinite(revision) ? revision : 0,
    syncedAt: settings[SYNCED_AT_KEY] ?? null,
  };
}

export async function runSync(): Promise<SyncReport> {
  const db = await getDb();
  const state = await readSyncSettings();

  if (!state.url) throw new Error("Не указан адрес сервера синхронизации");

  const startedAt = new Date().toISOString();
  const outgoing = await collectChanges(db, state.syncedAt);
  const response = await service.exchange(state.url, state.revision, outgoing);
  const received = await applyChanges(db, response.changes);

  await writeSetting(REVISION_KEY, String(response.revision));
  await writeSetting(SYNCED_AT_KEY, startedAt);

  return { sent: outgoing.length, received, revision: response.revision };
}

export async function saveUrl(url: string): Promise<void> {
  await writeSetting(URL_KEY, url.trim().replace(/\/+$/, ""));
}

export async function resetSyncState(): Promise<void> {
  await writeSetting(REVISION_KEY, "0");
  await writeSetting(SYNCED_AT_KEY, "");
}
