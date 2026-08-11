<script setup lang="ts">
import { computed, watch } from "vue";
import { useForm } from "vee-validate";
import { storeToRefs } from "pinia";
import { FormInput } from "@/components/form";
import { UiButton, UiModal } from "@/components/ui";
import { raidKeyOf } from "@/lottery/draw";
import { useRaidsStore } from "@/stores/raids";
import type { EventInput, EventRaidSeats, GuildEvent } from "@/db/types";

interface QuotaRow {
  key: string;
  raidId: number | null;
  label: string;
  hint: string;
}

interface EventFormValues {
  title: string;
  eventDate: string;
  quotas: Record<string, number | undefined>;
}

const props = defineProps<{
  event: GuildEvent | null;
  seats?: EventRaidSeats[];
  isSaving?: boolean;
  lockSlots?: boolean;
}>();

const emit = defineEmits<{ save: [EventInput] }>();

const isOpen = defineModel<boolean>({ default: false });

const raidsStore = useRaidsStore();
const { items: raids, hasLoaded } = storeToRefs(raidsStore);

const title = computed(() => (props.event ? "Изменить осаду" : "Новая осада"));

const seats = computed(() => props.seats ?? []);

const rows = computed<QuotaRow[]>(() => {
  const known = new Set(seats.value.map((group) => raidKeyOf(group.raidId)));

  const fromRaids = raids.value
    .filter((raid) => raid.isActive || known.has(raid.id))
    .map((raid) => ({
      key: quotaKey(raid.id),
      raidId: raid.id,
      label: raid.name,
      hint: hintOf(raid.id),
    }));

  return [
    ...fromRaids,
    { key: quotaKey(null), raidId: null, label: "Без рейда", hint: hintOf(null) },
  ];
});

const layout = computed(() => rows.value.map((row) => row.key).join(","));

const validationSchema = computed(() => ({
  title: (value: string) => (value?.trim() ? true : "Укажите название"),
  eventDate: (value: string) => (value ? true : "Укажите дату"),
  ...Object.fromEntries(rows.value.map((row) => [`quotas.${row.key}`, quotaRule])),
}));

const { handleSubmit, resetForm, values } = useForm<EventFormValues>({
  validationSchema,
  initialValues: valuesOf(),
});

const total = computed(() =>
  rows.value.reduce((sum, row) => sum + (values.quotas?.[row.key] ?? 0), 0),
);

watch(
  [isOpen, layout],
  ([open]) => {
    if (!open) return;
    if (!hasLoaded.value) raidsStore.load();

    resetForm({ values: valuesOf() });
  },
  { immediate: true },
);

const onSubmit = handleSubmit((submitted) => {
  emit("save", {
    title: submitted.title,
    eventDate: submitted.eventDate,
    quotas: rows.value.map((row) => ({
      raidId: row.raidId,
      slots: submitted.quotas?.[row.key] ?? 0,
    })),
  });
});

function quotaRule(value: number | undefined): true | string {
  if (value === undefined) return "Укажите число";
  if (!Number.isInteger(value) || value < 0) return "Целое число, не меньше нуля";

  return true;
}

function quotaKey(raidId: number | null): string {
  return `r${raidKeyOf(raidId)}`;
}

function hintOf(raidId: number | null): string {
  if (!seats.value.length) return "";

  const group = seats.value.find((item) => raidKeyOf(item.raidId) === raidKeyOf(raidId));

  if (!group || group.signedUp === 0) return "никто не заявился";

  return `заявились ${group.signedUp}`;
}

function valuesOf(): EventFormValues {
  const stored = new Map(seats.value.map((group) => [raidKeyOf(group.raidId), group.slots]));

  return {
    title: props.event?.title ?? "Осада",
    eventDate: props.event?.eventDate ?? new Date().toISOString().slice(0, 10),
    quotas: Object.fromEntries(
      rows.value.map((row) => [row.key, stored.get(raidKeyOf(row.raidId)) ?? 0]),
    ),
  };
}
</script>

<template>
  <UiModal v-model="isOpen" :title="title" class="max-w-xl">
    <form class="flex flex-col gap-2" @submit="onSubmit">
      <FormInput name="title" label="Название" placeholder="Например, Осада 09.08" />
      <FormInput name="eventDate" label="Дата" type="date" />

      <div class="border-primary/15 mt-2 rounded-lg border p-4">
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <h4 class="text-sm font-semibold uppercase">Мест по рейдам</h4>
          <span class="text-muted text-sm">всего {{ total }}</span>
        </div>

        <p class="text-muted mb-3 text-sm">
          Каждый рейд разыгрывает только свои места. Если желающих меньше, чем мест, недобор
          остаётся пати-лидеру — другому рейду он не достанется.
        </p>

        <div class="grid gap-x-4 sm:grid-cols-2">
          <FormInput
            v-for="row in rows"
            :key="row.key"
            :name="`quotas.${row.key}`"
            :label="row.label"
            type="number"
            min="0"
            step="1"
            :disabled="lockSlots"
            :hint="row.hint"
          />
        </div>

        <p v-if="lockSlots" class="text-muted mt-2 text-sm">
          Жребий уже брошен — переиграйте его, чтобы менять места
        </p>
      </div>

      <div class="modal-action">
        <UiButton class="btn-ghost" @click="isOpen = false">Отмена</UiButton>
        <UiButton type="submit" :is-loading="isSaving">Сохранить</UiButton>
      </div>
    </form>
  </UiModal>
</template>
