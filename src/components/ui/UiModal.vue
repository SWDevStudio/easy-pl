<script setup lang="ts">
import { computed, onMounted, useAttrs, useTemplateRef, watch } from "vue";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title?: string;
    closable?: boolean;
    persistent?: boolean;
  }>(),
  { closable: true },
);

const isOpen = defineModel<boolean>({ default: false });
const attrs = useAttrs();
const boxAttrs = computed(() => omitClass(attrs));
const dialog = useTemplateRef<HTMLDialogElement>("dialog");

function sync(open: boolean) {
  const element = dialog.value;
  if (!element) return;

  if (open && !element.open) element.showModal();
  if (!open && element.open) element.close();
}

function close() {
  isOpen.value = false;
}

function onCancel(event: Event) {
  if (!props.persistent) return;

  event.preventDefault();
}

watch(isOpen, sync, { flush: "post" });
onMounted(() => sync(isOpen.value));
</script>

<template>
  <dialog ref="dialog" class="modal" @close="close" @cancel="onCancel">
    <div v-bind="boxAttrs" :class="cn('modal-box', attrs.class)">
      <button
        v-if="closable && !persistent"
        type="button"
        class="btn btn-sm btn-circle btn-ghost absolute end-2 top-2"
        aria-label="Закрыть"
        @click="close"
      >
        ✕
      </button>

      <h3 v-if="title || $slots.header" class="pe-8 text-lg font-bold">
        <slot name="header" :close="close">{{ title }}</slot>
      </h3>

      <div class="py-4">
        <slot :close="close" />
      </div>

      <div v-if="$slots.footer" class="modal-action">
        <slot name="footer" :close="close" />
      </div>
    </div>

    <form v-if="!persistent" method="dialog" class="modal-backdrop">
      <button type="submit">Закрыть</button>
    </form>
  </dialog>
</template>
