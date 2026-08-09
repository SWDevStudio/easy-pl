import { computed, ref, type CSSProperties, type Ref } from "vue";
import { useElementBounding, useWindowSize } from "@vueuse/core";

const GAP = 4;
const MIN_HEIGHT = 160;
const VIEWPORT_MARGIN = 16;

export function teleportTargetFor(element: HTMLElement | null): HTMLElement | "body" {
  return element?.closest("dialog") ?? "body";
}

export function useDropdownPanel(anchor: Ref<HTMLElement | null>, maxHeight = 288) {
  const target = ref<HTMLElement | "body">("body");
  const bounds = useElementBounding(anchor);
  const { height: viewportHeight } = useWindowSize();

  const style = computed<CSSProperties>(() => {
    const spaceBelow = viewportHeight.value - bounds.bottom.value;
    const spaceAbove = bounds.top.value;
    const openUp = spaceBelow < maxHeight && spaceAbove > spaceBelow;
    const available = (openUp ? spaceAbove : spaceBelow) - VIEWPORT_MARGIN;

    return {
      position: "fixed",
      left: `${bounds.left.value}px`,
      width: `${bounds.width.value}px`,
      maxHeight: `${Math.max(MIN_HEIGHT, Math.min(maxHeight, available))}px`,
      ...(openUp
        ? { bottom: `${viewportHeight.value - bounds.top.value + GAP}px` }
        : { top: `${bounds.bottom.value + GAP}px` }),
    };
  });

  function resolveTarget() {
    target.value = teleportTargetFor(anchor.value);
    bounds.update();
  }

  return { target, style, resolveTarget };
}
