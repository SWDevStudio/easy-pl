<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

defineProps<{
  label: string;
  icon: "edit" | "trash" | "star";
  filled?: boolean;
}>();

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));

const PATHS: Record<string, string> = {
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z",
  trash: "M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z",
};
</script>

<template>
  <button
    v-bind="rootAttrs"
    type="button"
    :class="cn('btn btn-sm btn-square btn-ghost', attrs.class)"
    :title="label"
    :aria-label="label"
  >
    <svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        :d="PATHS[icon]"
        stroke="currentColor"
        :fill="filled ? 'currentColor' : 'none'"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>
