import { computed, ref } from "vue";
import { defineStore } from "pinia";
import * as repository from "@/db/repositories/players";
import type { Player, PlayerInput } from "@/db/types";

export const usePlayersStore = defineStore("players", () => {
  const items = ref<Player[]>([]);
  const isLoading = ref(false);
  const hasLoaded = ref(false);
  const error = ref<string | null>(null);

  const averageDebt = computed(() => {
    if (!items.value.length) return 0;

    return items.value.reduce((total, item) => total + item.debt, 0) / items.value.length;
  });

  async function load() {
    isLoading.value = true;

    try {
      items.value = await repository.listPlayers();
      error.value = null;
      hasLoaded.value = true;
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      isLoading.value = false;
    }
  }

  async function save(id: number | null, input: PlayerInput) {
    return reload(() => (id === null ? repository.createPlayer(input) : repository.updatePlayer(id, input)));
  }

  async function toggleFavorite(player: Player) {
    const isFavorite = !player.isFavorite;

    return commit(async () => {
      await repository.setFavorite(player.id, isFavorite);
      patch(player.id, (item) => {
        item.isFavorite = isFavorite;
      });
    });
  }

  async function setDebt(player: Player, debt: number) {
    return commit(async () => {
      const stored = await repository.setDebt(player.id, debt);
      patch(player.id, (item) => {
        item.debt = stored;
      });
    });
  }

  async function remove(id: number) {
    return reload(() => repository.deletePlayer(id));
  }

  function patch(id: number, change: (item: Player) => void) {
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

  return {
    items,
    averageDebt,
    isLoading,
    hasLoaded,
    error,
    load,
    save,
    toggleFavorite,
    setDebt,
    remove,
  };
});

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
