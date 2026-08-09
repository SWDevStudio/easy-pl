<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import DebtHint from "@/components/players/DebtHint.vue";
import PlayerFormModal from "@/components/players/PlayerFormModal.vue";
import {
  UiButton,
  UiConfirm,
  UiIconButton,
  UiPanel,
  UiStat,
  UiTable,
  type TableColumn,
} from "@/components/ui";
import { useClassesStore } from "@/stores/classes";
import { usePlayersStore } from "@/stores/players";
import { useRaidsStore } from "@/stores/raids";
import type { Player, PlayerInput } from "@/db/types";

const playersStore = usePlayersStore();
const classesStore = useClassesStore();
const raidsStore = useRaidsStore();

const { items, averageDebt, isLoading, hasLoaded, error } = storeToRefs(playersStore);
const { active: activeClasses } = storeToRefs(classesStore);
const { active: activeRaids } = storeToRefs(raidsStore);

const editing = ref<Player | null>(null);
const removing = ref<Player | null>(null);
const isFormOpen = ref(false);
const isConfirmOpen = ref(false);
const isSaving = ref(false);
const query = ref("");

const columns: TableColumn<Player>[] = [
  { key: "familyName", label: "Фамилия" },
  { key: "className", label: "Класс" },
  { key: "raidName", label: "Рейд", width: "10rem" },
  { key: "discord", label: "Discord", width: "12rem" },
  { key: "debt", label: "Долг", headerClass: "text-right", class: "text-right", width: "9rem" },
  { key: "actions", label: "", headerClass: "text-right", class: "text-right", width: "7rem" },
];

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();

  if (needle) {
    return items.value.filter((item) =>
      [item.familyName, item.className, item.raidName, item.discord].some((field) =>
        (field ?? "").toLowerCase().includes(needle),
      ),
    );
  }

  return [...items.value].sort((left, right) => Number(right.isFavorite) - Number(left.isFavorite));
});

const withoutClass = computed(() => items.value.filter((item) => !item.classId).length);
const favorites = computed(() => items.value.filter((item) => item.isFavorite).length);

onMounted(() => {
  playersStore.load();
  classesStore.load();
  raidsStore.load();
});

function openCreate() {
  editing.value = null;
  isFormOpen.value = true;
}

function openEdit(player: Player) {
  editing.value = player;
  isFormOpen.value = true;
}

function askRemove(player: Player) {
  removing.value = player;
  isConfirmOpen.value = true;
}

async function save(input: PlayerInput) {
  isSaving.value = true;
  const saved = await playersStore.save(editing.value?.id ?? null, input);
  isSaving.value = false;

  if (saved) isFormOpen.value = false;
}

async function confirmRemove() {
  if (!removing.value) return;

  isSaving.value = true;
  const removed = await playersStore.remove(removing.value.id);
  isSaving.value = false;

  if (removed) isConfirmOpen.value = false;
}

function onDebtInput(player: Player, event: Event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) return;

  const parsed = Number(target.value);

  if (Number.isNaN(parsed)) {
    target.value = formatDebt(player.debt);
    return;
  }

  playersStore.setDebt(player, parsed);
}

function formatDebt(debt: number): string {
  const rounded = debt.toFixed(1);

  return rounded === "-0.0" ? "0.0" : rounded;
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <UiPanel
      class="col-span-2 lg:col-span-4"
      title="Состав гильдии"
      subtitle="Игровая фамилия и класс каждого бойца"
      body-class="hidden"
    >
      <template #actions>
        <input v-model="query" type="search" class="input w-64" placeholder="Поиск" />
        <UiButton @click="openCreate">Добавить</UiButton>
      </template>
    </UiPanel>

    <UiStat label="В гильдии" :value="items.length" :is-loading="isLoading && !hasLoaded" />
    <UiStat
      label="Средний долг"
      :value="formatDebt(averageDebt)"
      hint="Ноль — все в равных условиях"
      :is-loading="isLoading && !hasLoaded"
    />
    <UiStat
      label="Избранных"
      :value="favorites"
      hint="Идут вне жребия"
      :is-loading="isLoading && !hasLoaded"
    />
    <UiStat
      label="Без класса"
      :value="withoutClass"
      hint="Нужно проставить"
      :is-loading="isLoading && !hasLoaded"
    />

    <div v-if="error" class="alert alert-error col-span-2 lg:col-span-4">{{ error }}</div>

    <UiPanel class="col-span-2 lg:col-span-4" body-class="p-0">
      <UiTable
        :items="visible"
        :columns="columns"
        row-key="id"
        :is-loading="isLoading"
        class="table-zebra table-pin-rows"
        wrapper-class="max-h-[calc(100vh-24rem)] overflow-y-auto"
      >
        <template #cell-familyName="{ item }">
          <div class="flex items-center gap-2">
            <UiIconButton
              icon="star"
              :filled="item.isFavorite"
              :label="item.isFavorite ? 'Убрать из избранных' : 'Сделать избранным'"
              :class="item.isFavorite ? 'text-primary' : 'text-muted/40 hover:text-primary'"
              @click="playersStore.toggleFavorite(item)"
            />
            <span class="font-medium">{{ item.familyName }}</span>
          </div>
        </template>

        <template #cell-className="{ item }">
          <span v-if="item.className">{{ item.className }}</span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #header-debt>
          <span class="inline-flex items-center gap-1">Долг <DebtHint /></span>
        </template>

        <template #cell-raidName="{ item }">
          <span v-if="item.raidName" class="badge badge-soft badge-secondary">{{ item.raidName }}</span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #cell-discord="{ item }">
          <span v-if="item.discord">{{ item.discord }}</span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #cell-debt="{ item }">
          <input
            type="number"
            step="0.5"
            min="-10"
            max="10"
            class="input input-sm w-20 text-right"
            :class="item.debt > 0.05 ? 'text-success' : item.debt < -0.05 ? 'text-muted' : ''"
            :value="formatDebt(item.debt)"
            :title="`Долг ${formatDebt(item.debt)} — можно поправить вручную`"
            @change="onDebtInput(item, $event)"
          />
        </template>

        <template #cell-actions="{ item }">
          <div class="row-actions flex justify-end gap-1">
            <UiIconButton icon="edit" label="Изменить" @click="openEdit(item)" />
            <UiIconButton icon="trash" label="Удалить" class="text-error" @click="askRemove(item)" />
          </div>
        </template>

        <template #empty>В гильдии пока никого</template>
      </UiTable>
    </UiPanel>

    <PlayerFormModal
      v-model="isFormOpen"
      :player="editing"
      :classes="activeClasses"
      :raids="activeRaids"
      :is-saving="isSaving"
      @save="save"
    />

    <UiConfirm
      v-model="isConfirmOpen"
      title="Удалить игрока"
      :message="`Удалить ${removing?.familyName}? Вместе с ним пропадут его записи в прошлых осадах.`"
      confirm-text="Удалить"
      :is-loading="isSaving"
      @confirm="confirmRemove"
    />
  </div>
</template>
