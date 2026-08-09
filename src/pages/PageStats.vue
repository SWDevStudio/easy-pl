<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { UiButton, UiPanel, UiStat, UiTable, type TableColumn } from "@/components/ui";
import UiLineChart, { type ChartSeries } from "@/components/ui/UiLineChart.vue";
import DebtHint from "@/components/players/DebtHint.vue";
import { useStatsStore, type StatsRange } from "@/stores/stats";
import type { EventStat, PlayerStat, RaidStat } from "@/db/repositories/stats";

const SERIES_COLORS = {
  signedUp: "#d95926",
  roster: "#3987e5",
  attended: "#199e70",
};

const RAID_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

const RANGES: { id: StatsRange; label: string }[] = [
  { id: "all", label: "Всё время" },
  { id: "180", label: "180 дней" },
  { id: "90", label: "90 дней" },
  { id: "30", label: "30 дней" },
];

const statsStore = useStatsStore();
const {
  scoped,
  players,
  raids,
  raidTimeline,
  range,
  totalEvents,
  totalNoShows,
  averageRate,
  activePlayers,
  isLoading,
  hasLoaded,
  error,
} = storeToRefs(statsStore);

const isFirstLoad = computed(() => isLoading.value && !hasLoaded.value);
const hiddenRaids = ref<string[]>([]);

const labels = computed(() => scoped.value.map((item) => formatDate(item.eventDate)));

const attendanceSeries = computed<ChartSeries[]>(() => [
  {
    key: "fill",
    name: "Заполнение",
    color: "#cdaa66",
    values: scoped.value.map((item) => (item.slots === 0 ? null : (item.attended / item.slots) * 100)),
    details: scoped.value.map((item) => `${item.attended} из ${item.slots}`),
  },
]);

const peopleSeries = computed<ChartSeries[]>(() => [
  {
    key: "signedUp",
    name: "Заявились",
    color: SERIES_COLORS.signedUp,
    values: scoped.value.map((item) => item.signedUp),
  },
  {
    key: "slots",
    name: "Мест",
    color: SERIES_COLORS.roster,
    values: scoped.value.map((item) => item.slots),
  },
  {
    key: "attended",
    name: "Пришли",
    color: SERIES_COLORS.attended,
    values: scoped.value.map((item) => item.attended),
  },
]);

const raidLabels = computed(() => {
  const seen = new Map<number, string>();

  for (const point of raidTimeline.value) seen.set(point.eventId, formatDate(point.eventDate));

  return [...seen.entries()];
});

const raidSeries = computed<ChartSeries[]>(() =>
  raids.value.map((raid, index) => ({
    key: String(raid.raidId),
    name: raid.name,
    color: RAID_COLORS[index % RAID_COLORS.length] ?? RAID_COLORS[0]!,
    values: raidLabels.value.map(([eventId]) => {
      const point = raidTimeline.value.find(
        (item) => item.eventId === eventId && item.raidId === raid.raidId,
      );

      return point?.attended ?? 0;
    }),
  })),
);

const rankedPlayers = computed(() =>
  [...players.value]
    .filter((item) => item.signedUp > 0)
    .sort((left, right) => right.attended - left.attended || left.familyName.localeCompare(right.familyName)),
);

const raidColumns: TableColumn<RaidStat>[] = [
  { key: "name", label: "Рейд" },
  { key: "members", label: "Игроков", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "signedUp", label: "Заявок", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "taken", label: "Прошли", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "attended", label: "Дошли", headerClass: "text-right", class: "text-right", width: "10rem" },
  {
    key: "rate",
    label: "Явка",
    headerClass: "text-right",
    class: "text-right",
    width: "8rem",
    sortValue: (item) => (item.signedUp === 0 ? null : item.attended / item.signedUp),
  },
  {
    key: "discipline",
    label: "Дисциплина",
    headerClass: "text-right",
    class: "text-right",
    width: "10rem",
    sortValue: (item) => (item.taken === 0 ? null : item.attended / item.taken),
  },
];

const eventColumns: TableColumn<EventStat>[] = [
  { key: "eventDate", label: "Дата", width: "8rem" },
  { key: "title", label: "Осада" },
  { key: "signedUp", label: "Заявились", headerClass: "text-right", class: "text-right", width: "9rem" },
  { key: "slots", label: "Мест", headerClass: "text-right", class: "text-right", width: "7rem" },
  { key: "attended", label: "Пришли", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "noShows", label: "Прогулы", headerClass: "text-right", class: "text-right", width: "8rem" },
  {
    key: "fill",
    label: "Заполнение",
    headerClass: "text-right",
    class: "text-right",
    width: "9rem",
    sortValue: (item) => (item.slots === 0 ? null : item.attended / item.slots),
  },
];

const columns: TableColumn<PlayerStat>[] = [
  { key: "familyName", label: "Фамилия" },
  { key: "className", label: "Класс" },
  { key: "signedUp", label: "Заявок", headerClass: "text-right", class: "text-right", width: "7rem" },
  { key: "taken", label: "В составе", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "attended", label: "Пришёл", headerClass: "text-right", class: "text-right", width: "7rem" },
  { key: "noShows", label: "Прогулы", headerClass: "text-right", class: "text-right", width: "7rem" },
  {
    key: "rate",
    label: "Явка",
    headerClass: "text-right",
    class: "text-right",
    width: "7rem",
    sortValue: (item) => (item.taken === 0 ? null : item.attended / item.taken),
  },
  { key: "debt", label: "Долг", headerClass: "text-right", class: "text-right", width: "6rem" },
];

onMounted(() => statsStore.load());

function formatDate(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function rateOf(item: PlayerStat): string {
  return item.taken === 0 ? "—" : `${Math.round((item.attended / item.taken) * 100)}%`;
}

function raidRate(item: RaidStat): number | null {
  return item.signedUp === 0 ? null : (item.attended / item.signedUp) * 100;
}

function raidDiscipline(item: RaidStat): number | null {
  return item.taken === 0 ? null : (item.attended / item.taken) * 100;
}

function rateClass(rate: number | null): string {
  if (rate === null) return "text-muted/50";
  if (rate < 50) return "text-error";
  if (rate < 75) return "text-warning";

  return "text-success";
}

function formatDebt(debt: number): string {
  const rounded = debt.toFixed(1);

  return rounded === "-0.0" ? "0.0" : rounded;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiPanel title="Статистика" subtitle="История осад и посещаемость гильдии" body-class="hidden">
      <template #actions>
        <div class="join">
          <UiButton
            v-for="item in RANGES"
            :key="item.id"
            class="join-item btn-sm"
            :class="range === item.id ? 'btn-primary' : 'btn-ghost'"
            @click="range = item.id"
          >
            {{ item.label }}
          </UiButton>
        </div>
      </template>
    </UiPanel>

    <div v-if="error" class="alert alert-error">{{ error }}</div>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UiStat label="Проведено осад" :value="totalEvents" :is-loading="isFirstLoad" />
      <UiStat
        label="Среднее заполнение"
        :value="`${Math.round(averageRate)}%`"
        hint="Пришли от числа мест"
        :is-loading="isFirstLoad"
      />
      <UiStat
        label="Прогулов"
        :value="totalNoShows"
        hint="Взяли слот и не пришли"
        :is-loading="isFirstLoad"
      />
      <UiStat
        label="Участвовало игроков"
        :value="activePlayers"
        hint="Хотя бы одна заявка"
        :is-loading="isFirstLoad"
      />
    </div>

    <UiPanel title="Заполнение осад" subtitle="Сколько мест из выделенных реально закрыто, %">
      <UiLineChart
        :labels="labels"
        :series="attendanceSeries"
        :max-value="100"
        unit="%"
        area
        :height="280"
        :is-loading="isLoading"
      />
    </UiPanel>

    <UiPanel title="Люди на осадах" subtitle="Сколько заявилось, сколько было мест и сколько дошло">
      <UiLineChart :labels="labels" :series="peopleSeries" :height="280" :is-loading="isLoading" />
    </UiPanel>

    <UiPanel
      title="Рейды по осадам"
      subtitle="Сколько человек привёл каждый рейд — снимите галку, чтобы убрать его с графика"
    >
      <UiLineChart
        v-model:hidden="hiddenRaids"
        :labels="raidLabels.map(([, label]) => label)"
        :series="raidSeries"
        :height="300"
        :is-loading="isLoading"
        toggleable
        empty-text="Проведённых осад пока нет"
      />
    </UiPanel>

    <UiPanel
      title="По рейдам"
      subtitle="Явка — дошли от заявок, дисциплина — дошли от тех, кто прошёл по жребию"
      body-class="p-0"
    >
      <UiTable
        :items="raids"
        :columns="raidColumns"
        row-key="raidId"
        :is-loading="isLoading"
        class="table-zebra"
        empty-text="Рейды не заведены"
      >
        <template #cell-name="{ item }">
          <span class="font-medium">{{ item.name }}</span>
        </template>

        <template #cell-signedUp="{ item }">
          <span :class="item.signedUp ? '' : 'text-muted/50'">{{ item.signedUp || "—" }}</span>
        </template>

        <template #cell-attended="{ item }">
          <span v-if="item.signedUp" class="tabular-nums">
            {{ item.attended }} из {{ item.signedUp }}
          </span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #cell-rate="{ item }">
          <span :class="rateClass(raidRate(item))">
            {{ raidRate(item) === null ? "—" : `${Math.round(raidRate(item) ?? 0)}%` }}
          </span>
        </template>

        <template #cell-discipline="{ item }">
          <span :class="rateClass(raidDiscipline(item))">
            {{ raidDiscipline(item) === null ? "—" : `${Math.round(raidDiscipline(item) ?? 0)}%` }}
          </span>
        </template>
      </UiTable>
    </UiPanel>

    <UiPanel title="Осады по датам" subtitle="Те же числа, что на графиках выше" body-class="p-0">
      <UiTable
        :items="scoped"
        :columns="eventColumns"
        row-key="eventId"
        :is-loading="isLoading"
        class="table-zebra table-pin-rows"
        wrapper-class="max-h-80 overflow-y-auto"
      >
        <template #cell-eventDate="{ item }">{{ formatDate(item.eventDate) }}</template>

        <template #cell-noShows="{ item }">
          <span :class="item.noShows > 0 ? 'text-error' : 'text-muted/50'">{{ item.noShows || "—" }}</span>
        </template>

        <template #cell-fill="{ item }">
          {{ item.slots === 0 ? "—" : `${Math.round((item.attended / item.slots) * 100)}%` }}
        </template>
        <template #empty>Проведённых осад пока нет</template>
      </UiTable>
    </UiPanel>

    <UiPanel title="По игрокам" subtitle="Те, кто хотя бы раз заявлялся" body-class="p-0">
      <UiTable
        :items="rankedPlayers"
        :columns="columns"
        row-key="playerId"
        :is-loading="isLoading"
        class="table-zebra table-pin-rows"
        wrapper-class="max-h-[32rem] overflow-y-auto"
      >
        <template #cell-familyName="{ item }">
          <span v-if="item.isFavorite" class="text-primary mr-1">★</span>
          <span class="font-medium">{{ item.familyName }}</span>
        </template>

        <template #header-debt>
          <span class="inline-flex items-center gap-1">Долг <DebtHint /></span>
        </template>

        <template #cell-className="{ item }">
          <span v-if="item.className">{{ item.className }}</span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #cell-noShows="{ item }">
          <span :class="item.noShows > 0 ? 'text-error' : 'text-muted/50'">{{ item.noShows || "—" }}</span>
        </template>

        <template #cell-rate="{ item }">{{ rateOf(item) }}</template>

        <template #cell-debt="{ item }">
          <span :class="item.debt > 0.05 ? 'text-success' : item.debt < -0.05 ? 'text-muted' : ''">
            {{ formatDebt(item.debt) }}
          </span>
        </template>

        <template #empty>Пока никто не заявлялся</template>
      </UiTable>
    </UiPanel>
  </div>
</template>
