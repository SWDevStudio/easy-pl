<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useElementSize } from "@vueuse/core";
import { useFirstLoad } from "@/composables/useFirstLoad";

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  values: (number | null)[];
  details?: (string | null)[];
}

const props = withDefaults(
  defineProps<{
    labels: string[];
    series: ChartSeries[];
    height?: number;
    unit?: string;
    maxValue?: number;
    area?: boolean;
    isLoading?: boolean;
    toggleable?: boolean;
    emptyText?: string;
  }>(),
  { height: 260, unit: "", emptyText: "Нет проведённых осад" },
);

const hidden = defineModel<string[]>("hidden", { default: () => [] });

const plotted = computed(() => props.series.filter((item) => !hidden.value.includes(item.key)));

function toggle(key: string) {
  hidden.value = hidden.value.includes(key)
    ? hidden.value.filter((item) => item !== key)
    : [...hidden.value, key];
}

const PADDING = { top: 16, right: 56, bottom: 28, left: 44 };
const TICK_COUNT = 4;

const root = useTemplateRef<HTMLElement>("root");
const { width } = useElementSize(root);
const activeIndex = ref<number | null>(null);

const chartWidth = computed(() => Math.max(width.value, 320));
const plotWidth = computed(() => chartWidth.value - PADDING.left - PADDING.right);
const plotHeight = computed(() => props.height - PADDING.top - PADDING.bottom);

const upperBound = computed(() => {
  if (props.maxValue !== undefined) return props.maxValue;

  const highest = Math.max(
    0,
    ...plotted.value.flatMap((item) => item.values.filter((value): value is number => value !== null)),
  );

  return niceCeiling(highest);
});

const ticks = computed(() =>
  Array.from({ length: TICK_COUNT + 1 }, (_, index) => (upperBound.value / TICK_COUNT) * index),
);

const hasData = computed(() => props.labels.length > 0);

const { isFirstLoad } = useFirstLoad(
  () => props.isLoading,
  () => hasData.value,
);

function niceCeiling(value: number): number {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return step * magnitude;
}

function xAt(index: number): number {
  if (props.labels.length <= 1) return PADDING.left + plotWidth.value / 2;

  return PADDING.left + (plotWidth.value / (props.labels.length - 1)) * index;
}

function yAt(value: number): number {
  return PADDING.top + plotHeight.value * (1 - value / upperBound.value);
}

function lineFor(series: ChartSeries): string {
  return series.values
    .map((value, index) => (value === null ? null : `${xAt(index)},${yAt(value)}`))
    .filter((point): point is string => point !== null)
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");
}

function areaFor(series: ChartSeries): string {
  const line = lineFor(series);
  if (!line) return "";

  const baseline = PADDING.top + plotHeight.value;

  return `${line} L${xAt(series.values.length - 1)},${baseline} L${xAt(0)},${baseline} Z`;
}

function lastIndexWithValue(series: ChartSeries): number {
  for (let index = series.values.length - 1; index >= 0; index -= 1) {
    if (series.values[index] !== null) return index;
  }

  return -1;
}

function format(value: number | null): string {
  if (value === null) return "—";

  return `${Math.round(value * 10) / 10}${props.unit}`;
}

function onMove(event: PointerEvent) {
  if (!hasData.value) return;

  const target = event.currentTarget;

  if (!(target instanceof Element)) return;

  const bounds = target.getBoundingClientRect();
  const offset = event.clientX - bounds.left - PADDING.left;
  const step = props.labels.length <= 1 ? 1 : plotWidth.value / (props.labels.length - 1);

  activeIndex.value = Math.max(0, Math.min(props.labels.length - 1, Math.round(offset / step)));
}

function onLeave() {
  activeIndex.value = null;
}

function move(delta: number) {
  if (!hasData.value) return;

  const next = (activeIndex.value ?? 0) + delta;
  activeIndex.value = Math.max(0, Math.min(props.labels.length - 1, next));
}

const axisLabels = computed(() => {
  const total = props.labels.length;
  if (total <= 6) return props.labels.map((label, index) => ({ label, index }));

  const stride = Math.ceil(total / 6);

  return props.labels
    .map((label, index) => ({ label, index }))
    .filter((item) => item.index % stride === 0 || item.index === total - 1);
});
</script>

<template>
  <figure ref="root" class="m-0 w-full">
    <figcaption v-if="series.length > 1" class="mb-3 flex flex-wrap gap-x-4 gap-y-2">
      <label
        v-for="item in series"
        :key="item.key"
        class="flex items-center gap-2 text-sm"
        :class="toggleable ? 'hover:text-primary cursor-pointer transition-colors' : ''"
      >
        <input
          v-if="toggleable"
          type="checkbox"
          class="checkbox checkbox-sm"
          :checked="!hidden.includes(item.key)"
          @change="toggle(item.key)"
        />
        <svg width="18" height="8" aria-hidden="true">
          <line
            x1="1"
            y1="4"
            x2="17"
            y2="4"
            :stroke="item.color"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        {{ item.name }}
      </label>
    </figcaption>

    <div v-if="isFirstLoad" class="skeleton w-full" :style="{ height: `${height}px` }" aria-hidden="true" />

    <p v-else-if="!hasData" class="text-muted py-12 text-center text-sm">{{ emptyText }}</p>

    <svg
      v-else
      :width="chartWidth"
      :height="height"
      :viewBox="`0 0 ${chartWidth} ${height}`"
      tabindex="0"
      role="img"
      class="focus-visible:outline-primary/50 max-w-full focus-visible:outline-2"
      @pointermove="onMove"
      @pointerleave="onLeave"
      @keydown.left.prevent="move(-1)"
      @keydown.right.prevent="move(1)"
    >
      <g>
        <line
          v-for="(tick, index) in ticks"
          :key="`grid-${index}`"
          :x1="PADDING.left"
          :x2="PADDING.left + plotWidth"
          :y1="yAt(tick)"
          :y2="yAt(tick)"
          class="stroke-primary/12"
          stroke-width="1"
        />
        <text
          v-for="(tick, index) in ticks"
          :key="`tick-${index}`"
          :x="PADDING.left - 8"
          :y="yAt(tick) + 4"
          text-anchor="end"
          class="fill-muted text-[11px] tabular-nums"
        >
          {{ Math.round(tick) }}
        </text>
      </g>

      <text
        v-for="item in axisLabels"
        :key="`x-${item.index}`"
        :x="xAt(item.index)"
        :y="height - 8"
        text-anchor="middle"
        class="fill-muted text-[11px]"
      >
        {{ item.label }}
      </text>

      <template v-for="item in plotted" :key="item.key">
        <path v-if="area" :d="areaFor(item)" :fill="item.color" opacity="0.1" />
        <path
          :d="lineFor(item)"
          fill="none"
          :stroke="item.color"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </template>

      <line
        v-if="activeIndex !== null"
        :x1="xAt(activeIndex)"
        :x2="xAt(activeIndex)"
        :y1="PADDING.top"
        :y2="PADDING.top + plotHeight"
        class="stroke-primary/50"
        stroke-width="1"
      />

      <template v-for="item in plotted" :key="`end-${item.key}`">
        <g v-if="lastIndexWithValue(item) >= 0 && plotted.length === 1">
          <circle
            :cx="xAt(lastIndexWithValue(item))"
            :cy="yAt(item.values[lastIndexWithValue(item)] ?? 0)"
            r="4"
            :fill="item.color"
            class="stroke-base-100"
            stroke-width="2"
          />
          <text
            :x="xAt(lastIndexWithValue(item)) + 10"
            :y="yAt(item.values[lastIndexWithValue(item)] ?? 0) + 4"
            class="fill-base-content text-[11px] font-medium tabular-nums"
          >
            {{ format(item.values[lastIndexWithValue(item)] ?? null) }}
          </text>
        </g>
      </template>

      <template v-if="activeIndex !== null">
        <circle
          v-for="item in plotted"
          :key="`dot-${item.key}`"
          :cx="xAt(activeIndex)"
          :cy="yAt(item.values[activeIndex] ?? 0)"
          r="4"
          :fill="item.color"
          class="stroke-base-100"
          stroke-width="2"
          :opacity="item.values[activeIndex] === null ? 0 : 1"
        />
      </template>
    </svg>

    <div
      v-if="activeIndex !== null && hasData"
      class="border-primary/30 bg-base-100 rounded-box mt-2 inline-block border px-3 py-2 shadow-lg"
    >
      <p class="text-muted text-sm">{{ labels[activeIndex] }}</p>
      <p v-for="item in plotted" :key="`tip-${item.key}`" class="flex items-center gap-2 text-sm">
        <svg width="14" height="8" aria-hidden="true">
          <line x1="1" y1="4" x2="13" y2="4" :stroke="item.color" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span class="font-semibold tabular-nums">{{ format(item.values[activeIndex] ?? null) }}</span>
        <span class="text-muted">{{ item.name }}</span>
        <span v-if="item.details?.[activeIndex]" class="text-muted">· {{ item.details[activeIndex] }}</span>
      </p>
    </div>
  </figure>
</template>
