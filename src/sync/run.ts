import { getDb } from "@/db/client";
import { readSettings, writeSetting } from "@/db/repositories/settings";
import * as service from "@/services/sync";
import { applyChanges, collectChanges } from "./changes";
import { normalizeUrl } from "./code";
import type { Change, SyncReport } from "./types";

export const URL_KEY = "sync.url";
const REVISION_KEY = "sync.revision";
const SYNCED_AT_KEY = "sync.syncedAt";
const PUSH_CHUNK = 200;
const MAX_ROUNDS = 200;

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

export async function runSync(): Promise<SyncReport> {
  const db = await getDb();
  const state = await readSyncSettings();

  if (!state.url) throw new Error("Не указан адрес сервера синхронизации");

  const startedAt = new Date().toISOString();
  const outgoing = dedupe(await collectChanges(db, state.syncedAt));
  const batches = chunk(outgoing, PUSH_CHUNK);

  let cursor = state.revision;
  let received = 0;
  let failed = 0;
  let deferred = 0;
  let sent = 0;
  let round = 0;
  let pending = true;

  while ((round < batches.length || pending) && round < MAX_ROUNDS) {
    const payload = batches[round] ?? [];
    const response = await service.exchange(state.url, cursor, payload);
    const result = await applyChanges(db, response.changes);

    sent += payload.length;
    received += result.applied;
    failed += result.failed;
    deferred += result.deferred;

    const advanced = result.cursor !== null && result.cursor > cursor;

    if (advanced && result.cursor !== null) cursor = result.cursor;

    pending = (response.hasMore && advanced) || round + 1 < batches.length;
    round += 1;
  }

  await writeSetting(REVISION_KEY, String(cursor));
  await writeSetting(SYNCED_AT_KEY, startedAt);

  return { sent, received, failed, deferred, revision: cursor };
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

function dedupe(changes: Change[]): Change[] {
  const latest = new Map<string, Change>();

  for (const change of changes) {
    const key = `${change.entity}:${change.uid}`;
    const known = latest.get(key);

    if (!known || change.updatedAt > known.updatedAt) latest.set(key, change);
  }

  return [...latest.values()];
}

function chunk(changes: Change[], size: number): Change[][] {
  const batches: Change[][] = [];

  for (let index = 0; index < changes.length; index += size) {
    batches.push(changes.slice(index, index + size));
  }

  return batches;
}
