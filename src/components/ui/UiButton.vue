<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    type?: "button" | "submit" | "reset";
    isLoading?: boolean;
    disabled?: boolean;
  }>(),
  { type: "button" },
);

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));
</script>

<template>
  <button
    v-bind="rootAttrs"
    :class="cn('btn btn-primary', attrs.class)"
    :type="type"
    :disabled="disabled || isLoading"
    :aria-busy="isLoading"
  >
    <span v-if="isLoading" class="loading loading-spinner loading-sm" />
    <slot v-else name="icon" />
    <slot />
  </button>
</template>
