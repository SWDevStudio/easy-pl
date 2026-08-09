<script setup lang="ts">
import { onMounted } from "vue";
import { UiPanel } from "@/components/ui";
import { useTheme } from "@/composables/useTheme";

const { current, themes, load, select } = useTheme();

onMounted(load);
</script>

<template>
  <UiPanel title="Оформление" subtitle="Применяется сразу, помнится между запусками">
    <div class="flex flex-wrap gap-3">
      <button
        v-for="theme in themes"
        :key="theme.id"
        type="button"
        class="rounded-box border p-4 text-left transition-colors"
        :class="
          current === theme.id
            ? 'border-primary bg-primary/10'
            : 'border-base-300 hover:border-primary/50'
        "
        :data-theme="theme.id"
        @click="select(theme.id)"
      >
        <span class="flex items-center gap-2">
          <span class="bg-base-100 border-base-300 flex gap-1 rounded-sm border p-1.5">
            <span class="bg-primary size-4 rounded-sm" />
            <span class="bg-secondary size-4 rounded-sm" />
            <span class="bg-base-content size-4 rounded-sm" />
          </span>
          <span class="text-base-content font-medium">{{ theme.name }}</span>
        </span>
        <span class="text-muted mt-2 block text-sm">{{ theme.hint }}</span>
      </button>
    </div>
  </UiPanel>
</template>
