<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn, omitClass } from "@/utils/cn";

defineProps<{
  title?: string;
  subtitle?: string;
  bodyClass?: string;
}>();

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));
</script>

<template>
  <section v-bind="rootAttrs" :class="cn('panel flex flex-col', attrs.class)">
    <header
      v-if="title || $slots.header || $slots.actions"
      class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4"
    >
      <div class="min-w-0 flex-1 basis-64">
        <slot name="header">
          <h2 class="panel-title truncate">{{ title }}</h2>
          <p v-if="subtitle" class="text-muted mt-1 text-sm">{{ subtitle }}</p>
        </slot>
      </div>

      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2 sm:ml-auto">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="title || $slots.header || $slots.actions" class="rule mx-4" />

    <div :class="cn('flex-1 p-4', bodyClass)">
      <slot />
    </div>
  </section>
</template>
