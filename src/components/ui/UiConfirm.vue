<script setup lang="ts">
import UiButton from "./UiButton.vue";
import UiModal from "./UiModal.vue";

withDefaults(
  defineProps<{
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    confirmClass?: string;
    isLoading?: boolean;
  }>(),
  {
    title: "Подтвердите действие",
    confirmText: "Подтвердить",
    cancelText: "Отмена",
    confirmClass: "btn-error",
  },
);

const emit = defineEmits<{ confirm: [] }>();

const isOpen = defineModel<boolean>({ default: false });
</script>

<template>
  <UiModal v-model="isOpen" :title="title" class="max-w-sm">
    <slot>{{ message }}</slot>

    <template #footer="{ close }">
      <UiButton class="btn-ghost" @click="close">{{ cancelText }}</UiButton>
      <UiButton :class="confirmClass" :is-loading="isLoading" @click="emit('confirm')">
        {{ confirmText }}
      </UiButton>
    </template>
  </UiModal>
</template>
