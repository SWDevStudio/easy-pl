import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import * as repository from "@/db/repositories/stats";

export type StatsRange = "all" | "30" | "90" | "180";

const EPOCH = "0001-01-01";

export const useStatsStore = defineStore("stats", () => {
  const events = ref<repository.EventStat[]>([]);
  const players = ref<repository.PlayerStat[]>([]);
  const raids = ref<repository.RaidStat[]>([]);
  const raidTimeline = ref<repository.RaidTimelinePoint[]>([]);
  const range = ref<StatsRange>("30");
  const isLoading = ref(false);
  const hasLoaded = ref(false);
  const error = ref<string | null>(null);

  const fromDate = computed(() => {
    if (range.value === "all") return EPOCH;

    const from = Date.now() - Number(range.value) * 24 * 60 * 60 * 1000;

    return new Date(from).toISOString().slice(0, 10);
  });

  const scoped = computed(() =>
    range.value === "all"
      ? events.value
      : events.value.filter((item) => item.eventDate >= fromDate.value),
  );

  const totalEvents = computed(() => scoped.value.length);
  const totalSlots = computed(() => scoped.value.reduce((sum, item) => sum + item.slots, 0));
  const totalAttended = computed(() => scoped.value.reduce((sum, item) => sum + item.attended, 0));
  const totalNoShows = computed(() => scoped.value.reduce((sum, item) => sum + item.noShows, 0));

  const averageRate = computed(() =>
    totalSlots.value === 0 ? 0 : (totalAttended.value / totalSlots.value) * 100,
  );

  const activePlayers = computed(() => players.value.filter((item) => item.signedUp > 0).length);

  async function load() {
    isLoading.value = true;

    try {
      events.value = await repository.listEventStats();
      players.value = await repository.listPlayerStats();
      raids.value = await repository.listRaidStats(fromDate.value);
      raidTimeline.value = await repository.listRaidTimeline(fromDate.value);
      error.value = null;
      hasLoaded.value = true;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      isLoading.value = false;
    }
  }

  async function loadRaids() {
    try {
      raids.value = await repository.listRaidStats(fromDate.value);
      raidTimeline.value = await repository.listRaidTimeline(fromDate.value);
      error.value = null;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  watch(fromDate, () => {
    if (hasLoaded.value) loadRaids();
  });

  return {
    events,
    players,
    raids,
    raidTimeline,
    range,
    scoped,
    totalEvents,
    totalSlots,
    totalAttended,
    totalNoShows,
    averageRate,
    activePlayers,
    isLoading,
    hasLoaded,
    error,
    load,
  };
});
