<script setup lang="ts" generic="TItem">
import { computed, ref, useAttrs, watch } from "vue";
import { useFirstLoad } from "@/composables/useFirstLoad";
import { cn, omitClass } from "@/utils/cn";
import { compareSortValues, type SortDirection } from "@/utils/sorting";
import UiButton from "./UiButton.vue";
import type { TableColumn } from "./types";

type RowKey = string | number;
type PageItem = number | "gap";

const PAGE_WINDOW = 1;
const REFRESH_DELTA = 1;

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    items: TItem[];
    columns: TableColumn<TItem>[];
    rowKey?: keyof TItem | ((item: TItem) => string | number);
    rowClass?: string | ((item: TItem, index: number) => string);
    isLoading?: boolean;
    emptyText?: string;
    wrapperClass?: string;
    skeletonRows?: number;
    pageSize?: number;
  }>(),
  { emptyText: "Нет данных", skeletonRows: 5, pageSize: 50 },
);

defineSlots<
  {
    caption?: () => unknown;
    loading?: () => unknown;
    empty?: () => unknown;
  } & {
    [K in `header-${string}`]?: (props: { column: TableColumn<TItem> }) => unknown;
  } & {
    [K in `cell-${string}`]?: (props: {
      item: TItem;
      value: unknown;
      index: number;
      column: TableColumn<TItem>;
    }) => unknown;
  }
>();

const attrs = useAttrs();
const tableAttrs = computed(() => omitClass(attrs));

const { isFirstLoad, isRefreshing } = useFirstLoad(
  () => props.isLoading,
  () => props.items.length > 0,
);

const sortKey = ref<string | null>(null);
const sortDirection = ref<SortDirection>("asc");
const page = ref(1);

const sortableKeys = computed(() => {
  const keys = new Set<string>();
  const [sample] = props.items;

  for (const column of props.columns) {
    if (column.sortable === false) continue;

    const hasValue = sample !== undefined && getCellValue(sample, column) !== undefined;

    if (column.sortable === true || column.sortValue !== undefined || hasValue) keys.add(column.key);
  }

  return keys;
});

const activeColumn = computed(() => {
  if (sortKey.value === null) return null;

  return props.columns.find((column) => column.key === sortKey.value && isSortable(column)) ?? null;
});

const rows = computed(() => {
  const column = activeColumn.value;

  if (column === null) return props.items;

  return [...props.items].sort((left, right) =>
    compareSortValues(sortValueOf(left, column), sortValueOf(right, column), sortDirection.value),
  );
});

const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / props.pageSize)));
const currentPage = computed(() => Math.min(Math.max(1, page.value), pageCount.value));

const pageRows = computed(() => {
  if (rows.value.length <= props.pageSize) return rows.value;

  const start = (currentPage.value - 1) * props.pageSize;

  return rows.value.slice(start, start + props.pageSize);
});

const rowOffset = computed(() => (currentPage.value - 1) * props.pageSize);
const rangeStart = computed(() => (rows.value.length ? rowOffset.value + 1 : 0));
const rangeEnd = computed(() => Math.min(currentPage.value * props.pageSize, rows.value.length));

const pageList = computed<PageItem[]>(() => {
  const list: PageItem[] = [];
  let previous = 0;

  for (let number = 1; number <= pageCount.value; number += 1) {
    const isEdge = number === 1 || number === pageCount.value;

    if (!isEdge && Math.abs(number - currentPage.value) > PAGE_WINDOW) continue;
    if (previous && number - previous > 1) list.push("gap");

    list.push(number);
    previous = number;
  }

  return list;
});

const membership = computed(() => new Set(props.items.map((item, index) => getRowKey(item, index))));

watch(membership, (next, previous) => {
  if (changedCount(next, previous) <= REFRESH_DELTA) return;

  page.value = 1;
});

watch([sortKey, sortDirection], () => {
  page.value = 1;
});

watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

function changedCount(next: Set<RowKey>, previous: Set<RowKey>): number {
  let changed = 0;

  for (const key of next) {
    if (!previous.has(key)) changed += 1;
  }

  for (const key of previous) {
    if (!next.has(key)) changed += 1;
  }

  return changed;
}

function goToPage(number: number) {
  page.value = Math.min(Math.max(1, number), pageCount.value);
}

function isSortable(column: TableColumn<TItem>): boolean {
  return sortableKeys.value.has(column.key);
}

function toggleSort(column: TableColumn<TItem>) {
  if (sortKey.value !== column.key) {
    sortKey.value = column.key;
    sortDirection.value = "asc";

    return;
  }

  if (sortDirection.value === "asc") {
    sortDirection.value = "desc";

    return;
  }

  sortKey.value = null;
  sortDirection.value = "asc";
}

function sortValueOf(item: TItem, column: TableColumn<TItem>): unknown {
  return column.sortValue ? column.sortValue(item) : getCellValue(item, column);
}

function sortStateOf(column: TableColumn<TItem>): SortDirection | null {
  return activeColumn.value?.key === column.key ? sortDirection.value : null;
}

function ariaSortOf(column: TableColumn<TItem>): "ascending" | "descending" | undefined {
  const state = sortStateOf(column);

  if (state === null) return undefined;

  return state === "asc" ? "ascending" : "descending";
}

function arrowClass(column: TableColumn<TItem>): string {
  const state = sortStateOf(column);

  if (state === null) return "text-muted/50";

  return state === "asc" ? "text-primary" : "text-primary rotate-180";
}

function getRowKey(item: TItem, index: number): RowKey {
  if (props.rowKey === undefined) return index;
  if (typeof props.rowKey === "function") return props.rowKey(item);

  return String(item[props.rowKey]);
}

function getRowClass(item: TItem, index: number): string {
  return typeof props.rowClass === "function" ? props.rowClass(item, index) : (props.rowClass ?? "");
}

function getCellValue(item: TItem, column: TableColumn<TItem>): unknown {
  if (typeof column.field === "function") return column.field(item);

  return readProperty(item, column.field ?? column.key);
}

function readProperty(source: unknown, key: PropertyKey): unknown {
  if (typeof source !== "object" || source === null) return undefined;

  return Reflect.get(source, key);
}

function formatCell(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
</script>

<template>
  <div class="w-full">
    <div :class="cn('w-full overflow-x-auto', wrapperClass)">
      <table v-bind="tableAttrs" :class="cn('table', attrs.class)">
        <caption v-if="$slots.caption" class="caption-top pb-2 text-left">
          <slot name="caption" />
        </caption>

        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              :class="column.headerClass"
              :style="column.width ? { width: column.width } : undefined"
              :aria-sort="ariaSortOf(column)"
            >
              <button
                v-if="isSortable(column)"
                type="button"
                class="hover:text-primary focus-visible:outline-primary/50 inline-flex cursor-pointer items-center gap-1 align-middle transition-colors focus-visible:outline-2"
                @click="toggleSort(column)"
              >
                <slot :name="`header-${column.key}`" :column="column">{{ column.label ?? column.key }}</slot>
                <svg
                  viewBox="0 0 12 12"
                  class="size-3 shrink-0"
                  :class="arrowClass(column)"
                  aria-hidden="true"
                >
                  <path d="M6 2.5 10.5 9h-9Z" fill="currentColor" />
                </svg>
              </button>

              <span v-else class="inline-flex items-center gap-1 align-middle">
                <slot :name="`header-${column.key}`" :column="column">{{ column.label ?? column.key }}</slot>
                <svg viewBox="0 0 12 12" class="invisible size-3 shrink-0" aria-hidden="true">
                  <path d="M6 2.5 10.5 9h-9Z" fill="currentColor" />
                </svg>
              </span>
            </th>
          </tr>
        </thead>

        <tbody class="transition-opacity duration-200" :class="{ 'opacity-70': isRefreshing }">
          <template v-if="isFirstLoad">
            <tr v-if="$slots.loading">
              <td :colspan="columns.length" class="py-8 text-center">
                <slot name="loading" />
              </td>
            </tr>

            <template v-else>
              <tr v-for="row in skeletonRows" :key="`skeleton-${row}`" aria-hidden="true">
                <td v-for="column in columns" :key="column.key" :class="column.class">
                  <span class="skeleton block h-[1.5em] w-full" />
                </td>
              </tr>
            </template>
          </template>

          <tr v-else-if="!rows.length">
            <td :colspan="columns.length" class="text-muted py-8 text-center">
              <slot name="empty">{{ emptyText }}</slot>
            </td>
          </tr>

          <template v-else>
            <tr
              v-for="(item, index) in pageRows"
              :key="getRowKey(item, rowOffset + index)"
              :class="getRowClass(item, rowOffset + index)"
            >
              <td v-for="column in columns" :key="column.key" :class="column.class">
                <slot
                  :name="`cell-${column.key}`"
                  :item="item"
                  :value="getCellValue(item, column)"
                  :index="rowOffset + index"
                  :column="column"
                >
                  {{ formatCell(getCellValue(item, column)) }}
                </slot>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <nav
      v-if="pageCount > 1"
      class="border-primary/15 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
      aria-label="Страницы"
    >
      <p class="text-muted text-sm">{{ rangeStart }}–{{ rangeEnd }} из {{ rows.length }}</p>

      <div class="join">
        <UiButton
          class="join-item btn-sm btn-ghost"
          :disabled="currentPage === 1"
          aria-label="Предыдущая страница"
          @click="goToPage(currentPage - 1)"
        >
          Назад
        </UiButton>

        <template v-for="(item, index) in pageList" :key="`page-${index}`">
          <span v-if="item === 'gap'" class="btn btn-sm btn-ghost join-item text-muted pointer-events-none">
            …
          </span>

          <UiButton
            v-else
            class="join-item btn-sm"
            :class="item === currentPage ? 'btn-primary' : 'btn-ghost'"
            :aria-current="item === currentPage ? 'page' : undefined"
            @click="goToPage(item)"
          >
            {{ item }}
          </UiButton>
        </template>

        <UiButton
          class="join-item btn-sm btn-ghost"
          :disabled="currentPage === pageCount"
          aria-label="Следующая страница"
          @click="goToPage(currentPage + 1)"
        >
          Вперёд
        </UiButton>
      </div>
    </nav>
  </div>
</template>
