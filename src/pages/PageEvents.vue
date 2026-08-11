<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import EventFormModal from "@/components/events/EventFormModal.vue";
import { UiButton, UiConfirm, UiIconButton, UiPanel, UiTable, type TableColumn } from "@/components/ui";
import { useEventsStore } from "@/stores/events";
import { useRaidsStore } from "@/stores/raids";
import type { EventInput, EventStatus, GuildEvent } from "@/db/types";

const router = useRouter();
const eventsStore = useEventsStore();
const raidsStore = useRaidsStore();
const { items, isLoading, isBusy, error } = storeToRefs(eventsStore);

const removing = ref<GuildEvent | null>(null);
const isFormOpen = ref(false);
const isConfirmOpen = ref(false);

const STATUS: Record<EventStatus, { label: string; badge: string }> = {
  draft: { label: "Набор", badge: "badge-ghost" },
  drawn: { label: "Жребий брошен", badge: "badge-warning badge-soft" },
  closed: { label: "Закрыта", badge: "badge-success badge-soft" },
};

const columns: TableColumn<GuildEvent>[] = [
  { key: "eventDate", label: "Дата", width: "9rem" },
  { key: "title", label: "Название" },
  { key: "status", label: "Статус", width: "12rem" },
  { key: "slots", label: "Мест", headerClass: "text-right", class: "text-right", width: "7rem" },
  { key: "signedUp", label: "Заявились", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "attended", label: "Пришли", headerClass: "text-right", class: "text-right", width: "8rem" },
  { key: "actions", label: "", headerClass: "text-right", class: "text-right", width: "5rem" },
];

onMounted(() => {
  eventsStore.load();
  if (!raidsStore.hasLoaded) raidsStore.load();
});

async function create(input: EventInput) {
  const id = await eventsStore.create(input);

  if (id === null) return;

  isFormOpen.value = false;
  router.push({ name: "event", params: { id } });
}

function askRemove(event: GuildEvent) {
  removing.value = event;
  isConfirmOpen.value = true;
}

async function confirmRemove() {
  if (!removing.value) return;

  const removed = await eventsStore.remove(removing.value.id);

  if (removed) isConfirmOpen.value = false;
}

function formatDate(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ru-RU");
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiPanel title="Осады" subtitle="События с ограниченным числом мест" body-class="hidden">
      <template #actions>
        <UiButton @click="isFormOpen = true">Создать осаду</UiButton>
      </template>
    </UiPanel>

    <div v-if="error" class="alert alert-error">{{ error }}</div>

    <UiPanel body-class="p-0">
      <UiTable :items="items" :columns="columns" row-key="id" :is-loading="isLoading" class="table-zebra">
        <template #cell-eventDate="{ item }">{{ formatDate(item.eventDate) }}</template>

        <template #cell-title="{ item }">
          <RouterLink
            :to="{ name: 'event', params: { id: item.id } }"
            class="hover:text-primary font-medium underline-offset-4 hover:underline"
          >
            {{ item.title }}
          </RouterLink>
        </template>

        <template #cell-status="{ item }">
          <span class="badge" :class="STATUS[item.status].badge">{{ STATUS[item.status].label }}</span>
        </template>

        <template #cell-signedUp="{ item }">
          <span :class="item.signedUp ? '' : 'text-muted/50'">{{ item.signedUp || "—" }}</span>
        </template>

        <template #cell-attended="{ item }">
          <span :class="item.status === 'draft' ? 'text-muted/50' : ''">
            {{ item.status === "draft" ? "—" : `${item.attended} / ${item.taken}` }}
          </span>
        </template>

        <template #cell-actions="{ item }">
          <div class="row-actions flex justify-end">
            <UiIconButton icon="trash" label="Удалить" class="text-error" @click="askRemove(item)" />
          </div>
        </template>

        <template #empty>Осад пока нет — создайте первую</template>
      </UiTable>
    </UiPanel>

    <EventFormModal v-model="isFormOpen" :event="null" :is-saving="isBusy" @save="create" />

    <UiConfirm
      v-model="isConfirmOpen"
      title="Удалить осаду"
      :message="`Удалить «${removing?.title}»? Состав, жребий и отметки явки пропадут.`"
      confirm-text="Удалить"
      :is-loading="isBusy"
      @confirm="confirmRemove"
    />
  </div>
</template>
