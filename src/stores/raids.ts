import { computed, ref } from "vue";
import { defineStore } from "pinia";
import * as repository from "@/db/repositories/raids";
import type { Raid, RaidInput } from "@/db/types";

export const useRaidsStore = defineStore("raids", () => {
  const items = ref<Raid[]>([]);
  const isLoading = ref(false);
  const hasLoaded = ref(false);
  const error = ref<string | null>(null);

  const active = computed(() => items.value.filter((item) => item.isActive));

  async function load() {
    isLoading.value = true;

    try {
      items.value = await repository.listRaids();
      error.value = null;
      hasLoaded.value = true;
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      isLoading.value = false;
    }
  }

  async function save(id: number | null, input: RaidInput) {
    return reload(() => (id === null ? repository.createRaid(input) : repository.updateRaid(id, input)));
  }

  async function toggleActive(item: Raid) {
    const isActive = !item.isActive;

    return commit(async () => {
      await repository.setRaidActive(item.id, isActive);
      patch(item.id, (found) => {
        found.isActive = isActive;
      });
    });
  }

  async function remove(id: number) {
    return reload(() => repository.deleteRaid(id));
  }

  function patch(id: number, change: (item: Raid) => void) {
    const found = items.value.find((item) => item.id === id);

    if (found) change(found);
  }

  async function commit(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      error.value = null;

      return true;
    } catch (cause) {
      error.value = messageOf(cause);

      return false;
    }
  }

  async function reload(action: () => Promise<void>): Promise<boolean> {
    const done = await commit(action);

    if (done) await load();

    return done;
  }

  return { items, active, isLoading, hasLoaded, error, load, save, toggleActive, remove };
});

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
