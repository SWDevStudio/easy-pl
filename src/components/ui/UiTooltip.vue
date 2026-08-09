<script setup lang="ts">
import { computed, ref, useTemplateRef, type CSSProperties } from "vue";
import { useElementBounding, useElementSize, useWindowSize } from "@vueuse/core";
import { teleportTargetFor } from "@/composables/useDropdownPanel";
import { cn } from "@/utils/cn";

type Placement = "top" | "bottom" | "left" | "right";

const props = withDefaults(
  defineProps<{
    placement?: Placement;
    label?: string;
    panelClass?: string;
  }>(),
  { placement: "top", label: "Подсказка" },
);

defineSlots<{
  default?: () => unknown;
  trigger?: () => unknown;
}>();

const GAP = 8;
const MARGIN = 8;
const FALLBACK_SIZE = { width: 220, height: 44 };

const trigger = useTemplateRef<HTMLElement>("trigger");
const panel = useTemplateRef<HTMLElement>("panel");
const isOpen = ref(false);
const target = ref<HTMLElement | "body">("body");

const bounds = useElementBounding(trigger);
const panelSize = useElementSize(panel);
const { width: viewportWidth, height: viewportHeight } = useWindowSize();

const size = computed(() => ({
  width: panelSize.width.value || FALLBACK_SIZE.width,
  height: panelSize.height.value || FALLBACK_SIZE.height,
}));

const placement = computed<Placement>(() => {
  const { width, height } = size.value;

  if (props.placement === "top" && bounds.top.value - height - GAP < MARGIN) return "bottom";
  if (props.placement === "bottom" && bounds.bottom.value + height + GAP > viewportHeight.value - MARGIN) {
    return "top";
  }
  if (props.placement === "left" && bounds.left.value - width - GAP < MARGIN) return "right";
  if (props.placement === "right" && bounds.right.value + width + GAP > viewportWidth.value - MARGIN) {
    return "left";
  }

  return props.placement;
});

const style = computed<CSSProperties>(() => {
  const { width, height } = size.value;
  const centerX = bounds.left.value + bounds.width.value / 2 - width / 2;
  const centerY = bounds.top.value + bounds.height.value / 2 - height / 2;

  const position = {
    top: { top: bounds.top.value - height - GAP, left: centerX },
    bottom: { top: bounds.bottom.value + GAP, left: centerX },
    left: { top: centerY, left: bounds.left.value - width - GAP },
    right: { top: centerY, left: bounds.right.value + GAP },
  }[placement.value];

  return {
    position: "fixed",
    top: `${clamp(position.top, MARGIN, viewportHeight.value - height - MARGIN)}px`,
    left: `${clamp(position.left, MARGIN, viewportWidth.value - width - MARGIN)}px`,
  };
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.max(min, max), value));
}

function open() {
  target.value = teleportTargetFor(trigger.value);
  bounds.update();
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
}
</script>

<template>
  <span
    ref="trigger"
    class="inline-flex align-middle"
    tabindex="0"
    :aria-label="label"
    @mouseenter="open"
    @mouseleave="close"
    @focus="open"
    @blur="close"
    @click.stop
    @keydown.esc="close"
  >
    <slot name="trigger">
      <span
        class="border-muted/60 text-muted hover:border-primary hover:text-primary inline-flex size-4 cursor-help items-center justify-center rounded-full border text-[10px] leading-none font-semibold transition-colors"
        aria-hidden="true"
      >
        ?
      </span>
    </slot>

    <Teleport :to="target">
      <span
        v-if="isOpen"
        ref="panel"
        role="tooltip"
        :style="style"
        :class="
          cn(
            'border-primary/30 bg-base-100 rounded-box text-base-content pointer-events-none z-200 block max-w-xs border px-3 py-2 text-sm leading-snug font-normal normal-case shadow-2xl',
            panelClass,
          )
        "
      >
        <slot />
      </span>
    </Teleport>
  </span>
</template>
