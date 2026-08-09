import { computed, ref } from "vue";
import { defineStore } from "pinia";
import * as service from "@/services/sync";
import { readSettings, writeSetting } from "@/db/repositories/settings";
import { builtInConnection } from "@/config";

const PRESET_KEY = "sync.preset";
import { decodeConnection, encodeConnection, normalizeUrl, type Connection } from "@/sync/code";
import { runSync } from "@/sync/run";
import { clearUrl, readSyncSettings, resetSyncState, saveUrl } from "@/sync/settings";
import type { SyncReport } from "@/sync/types";

export const useSyncStore = defineStore("sync", () => {
  const url = ref("");
  const revision = ref(0);
  const syncedAt = ref<string | null>(null);
  const tokenSaved = ref(false);
  const isBusy = ref(false);
  const error = ref<string | null>(null);
  const report = ref<SyncReport | null>(null);

  const isConnected = computed(() => tokenSaved.value && url.value.length > 0);
  const fromBuild = ref(false);

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
    return run(async () => {
      report.value = await runSync();

      await load();
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

async function fingerprintOf(preset: Connection): Promise<string> {
  const bytes = new TextEncoder().encode(`${preset.url}\n${preset.token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
