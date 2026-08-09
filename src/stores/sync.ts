import { computed, ref } from "vue";
import { defineStore } from "pinia";
import * as service from "@/services/sync";
import { readSyncSettings, resetSyncState, runSync, saveUrl } from "@/sync/run";
import type { SyncReport } from "@/sync/types";

export const useSyncStore = defineStore("sync", () => {
  const url = ref("");
  const revision = ref(0);
  const syncedAt = ref<string | null>(null);
  const tokenSaved = ref(false);
  const isBusy = ref(false);
  const error = ref<string | null>(null);
  const report = ref<SyncReport | null>(null);

  const isReady = computed(() => tokenSaved.value && url.value.trim().length > 0);

  async function load() {
    try {
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

  async function saveToken(token: string) {
    return run(async () => {
      await service.saveToken(token);
      tokenSaved.value = true;
    });
  }

  async function clearToken() {
    return run(async () => {
      await service.clearToken();
      tokenSaved.value = false;
    });
  }

  async function setUrl(value: string) {
    return run(async () => {
      await saveUrl(value);
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
    isReady,
    error,
    report,
    load,
    saveToken,
    clearToken,
    setUrl,
    sync,
    forgetProgress,
  };
});

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
