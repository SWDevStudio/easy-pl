import { computed, ref } from "vue";
import { defineStore } from "pinia";
import * as service from "@/services/sync";
import { readSettings, writeSetting } from "@/db/repositories/settings";
import { builtInConnection } from "@/config";

import { useToast } from "@/composables/useToast";
import { onWrite } from "@/db/writes";
import { decodeConnection, encodeConnection, normalizeUrl, type Connection } from "@/sync/code";
import { runSync } from "@/sync/run";
import { clearUrl, readSyncSettings, resetSyncState, saveUrl } from "@/sync/settings";
import type { SyncReport } from "@/sync/types";

const PRESET_KEY = "sync.preset";
const QUIET_MS = 30_000;
const CLOSE_TIMEOUT_MS = 2500;

export type AutoState = "off" | "idle" | "pending" | "syncing" | "stale";

export const useSyncStore = defineStore("sync", () => {
  const toast = useToast();
  const url = ref("");
  const revision = ref(0);
  const syncedAt = ref<string | null>(null);
  const tokenSaved = ref(false);
  const isBusy = ref(false);
  const error = ref<string | null>(null);
  const report = ref<SyncReport | null>(null);

  const isConnected = computed(() => tokenSaved.value && url.value.length > 0);
  const fromBuild = ref(false);
  const hasPending = ref(false);
  const isSyncing = ref(false);
  const lastFailure = ref<string | null>(null);

  const autoState = computed<AutoState>(() => {
    if (!isConnected.value) return "off";
    if (isSyncing.value) return "syncing";
    if (lastFailure.value) return "stale";
    if (hasPending.value) return "pending";

    return "idle";
  });

  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  async function startAuto() {
    if (started) return;

    started = true;

    onWrite(() => {
      hasPending.value = true;
      schedule();
    });

    await load();
    await syncInBackground();
  }

  function schedule() {
    if (quietTimer !== null) clearTimeout(quietTimer);

    quietTimer = setTimeout(() => {
      quietTimer = null;
      void syncInBackground();
    }, QUIET_MS);
  }

  async function syncInBackground(): Promise<void> {
    if (!isConnected.value || isSyncing.value || isBusy.value) return;

    isSyncing.value = true;

    const before = new Date().toISOString();

    try {
      const result = await runSync();

      hasPending.value = false;
      lastFailure.value = null;
      report.value = result;

      await load();

      if (result.received > 0) await reloadData();
      if (moved(result)) toast.success(describe(result));
    } catch (cause) {
      lastFailure.value = messageOf(cause);
      hasPending.value = hasPending.value || before < new Date().toISOString();
    } finally {
      isSyncing.value = false;
    }
  }

  async function flushBeforeClose(): Promise<void> {
    if (!isConnected.value || !hasPending.value) return;

    if (quietTimer !== null) clearTimeout(quietTimer);

    await Promise.race([syncInBackground(), wait(CLOSE_TIMEOUT_MS)]);
  }

  async function load() {
    try {
      await adoptBuiltIn();

      const state = await readSyncSettings();

      url.value = state.url;
      revision.value = state.revision;
      syncedAt.value = state.syncedAt;
      tokenSaved.value = await service.hasToken();
      error.value = null;
    } catch (cause) {
      error.value = messageOf(cause);
    }
  }

  async function adoptBuiltIn() {
    const preset = builtInConnection();

    if (!preset.url) return;

    const fingerprint = await fingerprintOf(preset);
    const settings = await readSettings();
    const adopted = settings[PRESET_KEY] ?? "";
    const changed = adopted !== "" && adopted !== fingerprint;
    const state = await readSyncSettings();

    if (!state.url || changed) await saveUrl(preset.url);
    if (preset.token && (changed || !(await service.hasToken()))) await service.saveToken(preset.token);

    await writeSetting(PRESET_KEY, fingerprint);

    fromBuild.value = true;
  }

  async function connect(code: string) {
    return run(() => apply(decodeConnection(code)));
  }

  async function connectManually(address: string, token: string) {
    return run(() => apply({ url: normalizeUrl(address), token: token.trim() }));
  }

  async function apply(connection: Connection) {
    if (!connection.token) throw new Error("Ключ пустой");

    await service.saveToken(connection.token);
    await saveUrl(connection.url);
    await load();

    report.value = await runSync();

    await load();
  }

  async function disconnect() {
    return run(async () => {
      await service.clearToken();
      await clearUrl();
      await resetSyncState();

      report.value = null;

      await load();
    });
  }

  async function sync() {
    if (quietTimer !== null) clearTimeout(quietTimer);

    return run(async () => {
      const result = await runSync();

      report.value = result;
      hasPending.value = false;
      lastFailure.value = null;

      await load();
      await reloadData();

      toast.success(moved(result) ? describe(result) : "Всё уже совпадает");
    });
  }

  async function forgetProgress() {
    return run(async () => {
      await resetSyncState();

      report.value = null;

      await load();
    });
  }

  async function readCode(): Promise<string | null> {
    try {
      const token = await service.getToken();

      return encodeConnection({ url: url.value, token });
    } catch (cause) {
      error.value = messageOf(cause);

      return null;
    }
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    isBusy.value = true;

    try {
      await action();
      error.value = null;

      return true;
    } catch (cause) {
      error.value = messageOf(cause);
      toast.error(error.value);

      return false;
    } finally {
      isBusy.value = false;
    }
  }

  return {
    url,
    revision,
    syncedAt,
    tokenSaved,
    isBusy,
    isConnected,
    fromBuild,
    autoState,
    hasPending,
    isSyncing,
    lastFailure,
    startAuto,
    flushBeforeClose,
    error,
    report,
    load,
    connect,
    connectManually,
    disconnect,
    sync,
    forgetProgress,
    readCode,
  };
});

function moved(result: SyncReport): boolean {
  return result.sent > 0 || result.received > 0 || result.failed > 0 || result.deferred > 0;
}

function describe(result: SyncReport): string {
  const parts = [`отправлено ${result.sent}`, `принято ${result.received}`];

  if (result.deferred > 0) parts.push(`отложено ${result.deferred}`);
  if (result.failed > 0) parts.push(`не применилось ${result.failed}`);

  return `Данные сохранены: ${parts.join(", ")}`;
}

async function reloadData(): Promise<void> {
  const stores = await import("./index");

  await Promise.all(stores.reloadAll());
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fingerprintOf(preset: Connection): Promise<string> {
  const bytes = new TextEncoder().encode(`${preset.url}\n${preset.token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
