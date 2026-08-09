<script setup lang="ts">
import { computed, watch } from "vue";
import { useForm } from "vee-validate";
import { FormInput, FormSwitch } from "@/components/form";
import { UiButton, UiModal } from "@/components/ui";
import type { Raid, RaidInput } from "@/db/types";

interface RaidFormValues {
  name: string;
  isActive: boolean;
}

const props = defineProps<{
  raid: Raid | null;
  isSaving?: boolean;
}>();

const emit = defineEmits<{ save: [RaidInput] }>();

const isOpen = defineModel<boolean>({ default: false });

const title = computed(() => (props.raid ? "Изменить рейд" : "Новый рейд"));

const { handleSubmit, resetForm } = useForm<RaidFormValues>({
  validationSchema: {
    name: (value: string) => (value?.trim() ? true : "Укажите название рейда"),
  },
  initialValues: valuesOf(null),
});

watch(isOpen, (open) => {
  if (open) resetForm({ values: valuesOf(props.raid) });
});

const onSubmit = handleSubmit((values) => {
  emit("save", { name: values.name, isActive: values.isActive });
});

function valuesOf(raid: Raid | null): RaidFormValues {
  return {
    name: raid?.name ?? "",
    isActive: raid?.isActive ?? true,
  };
}
</script>

<template>
  <UiModal v-model="isOpen" :title="title" class="max-w-md">
    <form class="flex flex-col gap-2" @submit="onSubmit">
      <FormInput name="name" label="Название" placeholder="Например, Основной" />
      <FormSwitch name="isActive" label="Доступен для выбора" />

      <div class="modal-action">
        <UiButton class="btn-ghost" @click="isOpen = false">Отмена</UiButton>
        <UiButton type="submit" :is-loading="isSaving">Сохранить</UiButton>
      </div>
    </form>
  </UiModal>
</template>
