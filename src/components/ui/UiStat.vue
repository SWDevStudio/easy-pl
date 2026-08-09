<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { useFirstLoad } from "@/composables/useFirstLoad";
import { cn, omitClass } from "@/utils/cn";

const props = defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  isLoading?: boolean;
}>();

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));

const { isFirstLoad } = useFirstLoad(() => props.isLoading);
</script>

<template>
  <section v-bind="rootAttrs" :class="cn('panel flex flex-col justify-center gap-1 p-4', attrs.class)">
    <p class="text-muted text-sm font-medium tracking-wider uppercase">{{ label }}</p>
    <p v-if="isFirstLoad" class="skeleton h-9 w-24" aria-hidden="true" />
    <p v-else class="stat-figure-value">{{ value }}</p>
    <p v-if="hint" class="text-muted text-sm">{{ hint }}</p>
  </section>
</template>
