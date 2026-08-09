import { getDb } from "@/db/client";
import { writeSetting } from "@/db/repositories/settings";
import * as service from "@/services/sync";
import { applyChanges, collectChanges } from "./changes";
import { readSyncSettings, REVISION_KEY, SYNCED_AT_KEY } from "./settings";
import type { Change, SyncReport } from "./types";

const PUSH_CHUNK = 200;
const MAX_ROUNDS = 200;

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
    const advanced = result.cursor !== null && result.cursor > cursor;

    if (advanced && result.cursor !== null) cursor = result.cursor;

    sent += payload.length;
    received += result.applied;
    failed += result.failed;
    deferred += result.deferred;

    pending = (response.hasMore && advanced) || round + 1 < batches.length;
    round += 1;
  }

  await writeSetting(REVISION_KEY, String(cursor));
  await writeSetting(SYNCED_AT_KEY, startedAt);

  return { sent, received, failed, deferred, revision: cursor };
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
