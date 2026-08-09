<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { UiTooltip } from "@/components/ui";
import { useSyncStore, type AutoState } from "@/stores/sync";

const syncStore = useSyncStore();
const { autoState, syncedAt, lastFailure } = storeToRefs(syncStore);

const LABEL: Record<AutoState, string> = {
  off: "Не подключено",
  idle: "Синхронизировано",
  pending: "Есть несохранённые правки",
  syncing: "Синхронизация…",
  stale: "Не доехало",
};

const DOT: Record<AutoState, string> = {
  off: "bg-base-content/30",
  idle: "bg-success",
  pending: "bg-warning",
  syncing: "bg-info animate-pulse",
  stale: "bg-error",
};

const hint = computed(() => {
  if (autoState.value === "off") return "Общая база не подключена — Справочники → Синхронизация";
  if (autoState.value === "stale") return `${lastFailure.value ?? "Обмен не удался"}. Правки не потеряются — уедут, когда связь вернётся`;
  if (autoState.value === "pending") return "Уедет само через полминуты после последней правки";
  if (autoState.value === "syncing") return "Обмениваемся с общей базой";

  return syncedAt.value ? `Последний обмен: ${new Date(syncedAt.value).toLocaleString("ru-RU")}` : "Обмена ещё не было";
});
</script>

<template>
  <UiTooltip :text="hint" class="ml-auto">
    <button
      type="button"
      class="hover:bg-base-300 flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors"
      :disabled="autoState === 'off' || autoState === 'syncing'"
      @click="syncStore.sync()"
    >
      <span class="size-2 rounded-full" :class="DOT[autoState]" />
      <span class="text-muted">{{ LABEL[autoState] }}</span>
    </button>
  </UiTooltip>
</template>
