import { readSettings, writeSetting } from "@/db/repositories/settings";
import { normalizeUrl } from "./code";

export const URL_KEY = "sync.url";
export const REVISION_KEY = "sync.revision";
export const SYNCED_AT_KEY = "sync.syncedAt";

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
    syncedAt: settings[SYNCED_AT_KEY] || null,
  };
}

export async function saveUrl(url: string): Promise<void> {
  await writeSetting(URL_KEY, normalizeUrl(url));
}

export async function clearUrl(): Promise<void> {
  await writeSetting(URL_KEY, "");
}

export async function resetSyncState(): Promise<void> {
  await writeSetting(REVISION_KEY, "0");
  await writeSetting(SYNCED_AT_KEY, "");
}
