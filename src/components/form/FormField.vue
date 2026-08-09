<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

defineProps<{
  inputId: string;
  label?: string;
  hint?: string;
  error?: string;
}>();

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));
</script>

<template>
  <fieldset v-bind="rootAttrs" :class="cn('fieldset w-full', attrs.class)">
    <label v-if="label" class="fieldset-legend text-sm" :for="inputId">{{ label }}</label>
    <slot />
    <p v-if="error" class="text-error text-sm">{{ error }}</p>
    <p v-else-if="hint" class="text-muted text-sm">{{ hint }}</p>
  </fieldset>
</template>
