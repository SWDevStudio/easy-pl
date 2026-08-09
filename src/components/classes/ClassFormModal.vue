<script setup lang="ts">
import { computed, watch } from "vue";
import { useForm } from "vee-validate";
import { FormInput, FormSelect, FormSwitch } from "@/components/form";
import { UiButton, UiModal } from "@/components/ui";
import { buildDisplayName } from "@/db/repositories/classes";
import type { ClassPath, GameClass, GameClassInput } from "@/db/types";

interface ClassFormValues {
  baseName: string;
  path: ClassPath;
  displayName: string;
  isActive: boolean;
}

const props = defineProps<{
  gameClass: GameClass | null;
  isSaving?: boolean;
}>();

const emit = defineEmits<{ save: [GameClassInput] }>();

const isOpen = defineModel<boolean>({ default: false });

const PATHS: { id: ClassPath; name: string }[] = [
  { id: "succession", name: "Традиция" },
  { id: "awakening", name: "Пробуждение" },
  { id: "liberation", name: "Освобождение" },
  { id: "none", name: "Без ветки" },
];

const title = computed(() => (props.gameClass ? "Изменить класс" : "Новый класс"));

const { handleSubmit, resetForm, values } = useForm<ClassFormValues>({
  validationSchema: {
    baseName: (value: string) => (value?.trim() ? true : "Укажите название класса"),
    path: (value: string) => (value ? true : "Выберите ветку"),
  },
  initialValues: valuesOf(null),
});

const displayNameHint = computed(() => buildDisplayName(values.baseName ?? "", values.path ?? "succession"));

watch(isOpen, (open) => {
  if (open) resetForm({ values: valuesOf(props.gameClass) });
});

const onSubmit = handleSubmit((submitted) => {
  emit("save", {
    baseName: submitted.baseName,
    path: submitted.path,
    displayName: submitted.displayName,
    isActive: submitted.isActive,
  });
});

function valuesOf(gameClass: GameClass | null): ClassFormValues {
  return {
    baseName: gameClass?.baseName ?? "",
    path: gameClass?.path ?? "succession",
    displayName: gameClass?.displayName ?? "",
    isActive: gameClass?.isActive ?? true,
  };
}
</script>

<template>
  <UiModal v-model="isOpen" :title="title" class="max-w-lg">
    <form class="flex flex-col gap-2" @submit="onSubmit">
      <FormInput name="baseName" label="Класс" placeholder="Например, Ведьма" />
      <FormSelect name="path" label="Ветка" :options="PATHS" option-value="id" option-label="name" />
      <FormInput
        name="displayName"
        label="Отображаемое название"
        :placeholder="displayNameHint"
        hint="Пусто — соберётся из класса и ветки"
      />
      <FormSwitch name="isActive" label="Доступен для выбора" />

      <div class="modal-action">
        <UiButton class="btn-ghost" @click="isOpen = false">Отмена</UiButton>
        <UiButton type="submit" :is-loading="isSaving">Сохранить</UiButton>
      </div>
    </form>
  </UiModal>
</template>
