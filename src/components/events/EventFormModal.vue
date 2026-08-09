<script setup lang="ts">
import { computed, watch } from "vue";
import { useForm } from "vee-validate";
import { FormInput } from "@/components/form";
import { UiButton, UiModal } from "@/components/ui";
import type { EventInput, GuildEvent } from "@/db/types";

interface EventFormValues {
  title: string;
  eventDate: string;
  slots: number | undefined;
}

const props = defineProps<{
  event: GuildEvent | null;
  isSaving?: boolean;
  lockSlots?: boolean;
}>();

const emit = defineEmits<{ save: [EventInput] }>();

const isOpen = defineModel<boolean>({ default: false });

const title = computed(() => (props.event ? "Изменить осаду" : "Новая осада"));

const { handleSubmit, resetForm } = useForm<EventFormValues>({
  validationSchema: {
    title: (value: string) => (value?.trim() ? true : "Укажите название"),
    eventDate: (value: string) => (value ? true : "Укажите дату"),
    slots: (value: number | undefined) =>
      value !== undefined && value > 0 ? true : "Слотов должно быть больше нуля",
  },
  initialValues: valuesOf(null),
});

watch(isOpen, (open) => {
  if (open) resetForm({ values: valuesOf(props.event) });
});

const onSubmit = handleSubmit((values) => {
  emit("save", {
    title: values.title,
    eventDate: values.eventDate,
    slots: values.slots ?? 0,
  });
});

function valuesOf(event: GuildEvent | null): EventFormValues {
  return {
    title: event?.title ?? "Осада",
    eventDate: event?.eventDate ?? new Date().toISOString().slice(0, 10),
    slots: event?.slots ?? 10,
  };
}
</script>

<template>
  <UiModal v-model="isOpen" :title="title" class="max-w-lg">
    <form class="flex flex-col gap-2" @submit="onSubmit">
      <FormInput name="title" label="Название" placeholder="Например, Осада 09.08" />
      <FormInput name="eventDate" label="Дата" type="date" />
      <FormInput
        name="slots"
        label="Слотов"
        type="number"
        min="1"
        :disabled="lockSlots"
        :hint="lockSlots ? 'Жребий уже брошен — переиграйте его, чтобы менять слоты' : 'Сколько человек попадёт на событие'"
      />

      <div class="modal-action">
        <UiButton class="btn-ghost" @click="isOpen = false">Отмена</UiButton>
        <UiButton type="submit" :is-loading="isSaving">Сохранить</UiButton>
      </div>
    </form>
  </UiModal>
</template>
