<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useForm } from "vee-validate";
import { FormInput, FormSelect } from "@/components/form";
import { UiButton, UiModal } from "@/components/ui";
import { useDiscordStore } from "@/stores/discord";
import type { GameClass, Player, PlayerInput, Raid } from "@/db/types";

interface PlayerFormValues {
  familyName: string;
  classId: number | null;
  raidId: number | null;
  discordId: string | null;
  discord: string;
  joinedAt: string;
  note: string;
}

const props = defineProps<{
  player: Player | null;
  classes: GameClass[];
  raids: Raid[];
  isSaving?: boolean;
}>();

const emit = defineEmits<{ save: [PlayerInput] }>();

const isOpen = defineModel<boolean>({ default: false });

const discordStore = useDiscordStore();
const { members, isReady, isLoadingMembers } = storeToRefs(discordStore);

const title = computed(() => (props.player ? "Изменить игрока" : "Новый игрок"));
const hasMembers = computed(() => members.value.length > 0);

const discordHint = computed(() => {
  if (isLoadingMembers.value) return "Загружаем участников сервера...";
  if (!isReady.value) return "Настройте бота в справочниках, чтобы выбирать из списка";

  return "Список сервера недоступен — проверьте VPN и настройки бота";
});

const memberOptions = computed(() =>
  members.value.map((member) => ({
    id: member.id,
    label: member.displayName === member.username ? member.username : `${member.displayName} · ${member.username}`,
  })),
);

const { handleSubmit, resetForm } = useForm<PlayerFormValues>({
  validationSchema: {
    familyName: (value: string) => (value?.trim() ? true : "Укажите игровую фамилию"),
    joinedAt: (value: string) => (value ? true : "Укажите дату вступления"),
  },
  initialValues: valuesOf(null),
});

watch(isOpen, async (open) => {
  if (!open) return;

  resetForm({ values: valuesOf(props.player) });
  await discordStore.ensureMembers();
});

const onSubmit = handleSubmit((submitted) => {
  const member = members.value.find((item) => item.id === submitted.discordId);

  emit("save", {
    familyName: submitted.familyName,
    classId: submitted.classId,
    raidId: submitted.raidId,
    discord: member?.username ?? submitted.discord.trim() ?? null,
    discordId: submitted.discordId,
    joinedAt: submitted.joinedAt,
    note: submitted.note.trim() || null,
  });
});

function valuesOf(player: Player | null): PlayerFormValues {
  return {
    familyName: player?.familyName ?? "",
    classId: player?.classId ?? null,
    raidId: player?.raidId ?? null,
    discordId: player?.discordId ?? null,
    discord: player?.discord ?? "",
    joinedAt: (player?.joinedAt ?? new Date().toISOString()).slice(0, 10),
    note: player?.note ?? "",
  };
}
</script>

<template>
  <UiModal v-model="isOpen" :title="title" class="max-w-lg">
    <form class="flex flex-col gap-2" @submit="onSubmit">
      <FormInput name="familyName" label="Игровая фамилия" placeholder="Например, Kalimdor" />

      <FormSelect
        name="classId"
        label="Класс"
        :options="classes"
        option-value="id"
        option-label="displayName"
        searchable
        clearable
        placeholder="Не указано"
      >
        <template #empty>Классов нет — добавьте их в настройках</template>
      </FormSelect>

      <FormSelect
        name="raidId"
        label="Рейд"
        :options="raids"
        option-value="id"
        option-label="name"
        placeholder="Без рейда"
        clearable
      >
        <template #empty>Рейдов нет — добавьте их в настройках</template>
      </FormSelect>

      <FormSelect
        v-if="hasMembers"
        name="discordId"
        label="Discord"
        :options="memberOptions"
        option-value="id"
        option-label="label"
        searchable
        clearable
        placeholder="Не привязан"
        hint="Список участников вашего сервера"
      />

      <FormInput
        v-else
        name="discord"
        label="Ник в Discord"
        placeholder="Необязательно"
        autocomplete="off"
        :hint="discordHint"
      />

      <FormInput name="joinedAt" label="В гильдии с" type="date" />
      <FormInput name="note" label="Заметка" placeholder="Необязательно" />

      <div class="modal-action">
        <UiButton class="btn-ghost" @click="isOpen = false">Отмена</UiButton>
        <UiButton type="submit" :is-loading="isSaving">Сохранить</UiButton>
      </div>
    </form>
  </UiModal>
</template>
