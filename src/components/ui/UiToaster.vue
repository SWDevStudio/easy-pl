<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { useToast } from "@/composables/useToast";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));
const { items, dismiss } = useToast();
</script>

<template>
  <Teleport to="body">
    <div v-bind="rootAttrs" :class="cn('toast toast-end z-100 max-w-md', attrs.class)">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-y-2 opacity-0"
      >
        <div
          v-for="item in items"
          :key="item.id"
          role="status"
          aria-live="polite"
          :class="cn('alert items-start gap-3 text-sm shadow-lg', item.class)"
        >
          <span class="flex-1">{{ item.text }}</span>
          <button
            type="button"
            class="opacity-60 transition-opacity hover:opacity-100"
            aria-label="Закрыть"
            @click="dismiss(item.id)"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
