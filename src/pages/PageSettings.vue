<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import ClassFormModal from "@/components/classes/ClassFormModal.vue";
import DiscordSettingsPanel from "@/components/discord/DiscordSettingsPanel.vue";
import RaidFormModal from "@/components/raids/RaidFormModal.vue";
import ThemePanel from "@/components/settings/ThemePanel.vue";
import SyncSettingsPanel from "@/components/sync/SyncSettingsPanel.vue";
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
import { useRaidsStore } from "@/stores/raids";
import type { ClassPath, GameClass, GameClassInput, Raid, RaidInput } from "@/db/types";

const classesStore = useClassesStore();
const raidsStore = useRaidsStore();

const { items, active, isLoading, hasLoaded, error } = storeToRefs(classesStore);
const { items: raids, active: activeRaids, isLoading: isRaidsLoading, error: raidsError } = storeToRefs(raidsStore);

const editingClass = ref<GameClass | null>(null);
const removingClass = ref<GameClass | null>(null);
const isClassFormOpen = ref(false);
const isClassConfirmOpen = ref(false);

const editingRaid = ref<Raid | null>(null);
const removingRaid = ref<Raid | null>(null);
const isRaidFormOpen = ref(false);
const isRaidConfirmOpen = ref(false);

const isSaving = ref(false);
const query = ref("");

const PATH_LABEL: Record<ClassPath, string> = {
  succession: "Традиция",
  awakening: "Пробуждение",
  liberation: "Освобождение",
  none: "—",
};

const classColumns: TableColumn<GameClass>[] = [
  { key: "displayName", label: "Название" },
  { key: "baseName", label: "Класс", width: "14rem" },
  { key: "path", label: "Ветка", width: "11rem" },
  { key: "isActive", label: "Доступен", width: "8rem" },
  { key: "actions", label: "", headerClass: "text-right", class: "text-right", width: "11rem" },
];

const raidColumns: TableColumn<Raid>[] = [
  { key: "name", label: "Название" },
  { key: "isActive", label: "Доступен", width: "8rem" },
  { key: "actions", label: "", headerClass: "text-right", class: "text-right", width: "11rem" },
];

const visibleClasses = computed(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return items.value;

  return items.value.filter((item) => item.displayName.toLowerCase().includes(needle));
});

const successionCount = computed(() => items.value.filter((item) => item.path === "succession").length);
const awakeningCount = computed(() => items.value.filter((item) => item.path === "awakening").length);

onMounted(() => {
  classesStore.load();
  raidsStore.load();
});

function openCreateClass() {
  editingClass.value = null;
  isClassFormOpen.value = true;
}

function openEditClass(gameClass: GameClass) {
  editingClass.value = gameClass;
  isClassFormOpen.value = true;
}

function askRemoveClass(gameClass: GameClass) {
  removingClass.value = gameClass;
  isClassConfirmOpen.value = true;
}

async function saveClass(input: GameClassInput) {
  isSaving.value = true;
  const saved = await classesStore.save(editingClass.value?.id ?? null, input);
  isSaving.value = false;

  if (saved) isClassFormOpen.value = false;
}

async function confirmRemoveClass() {
  if (!removingClass.value) return;

  isSaving.value = true;
  const removed = await classesStore.remove(removingClass.value.id);
  isSaving.value = false;

  if (removed) isClassConfirmOpen.value = false;
}

function openCreateRaid() {
  editingRaid.value = null;
  isRaidFormOpen.value = true;
}

function openEditRaid(raid: Raid) {
  editingRaid.value = raid;
  isRaidFormOpen.value = true;
}

function askRemoveRaid(raid: Raid) {
  removingRaid.value = raid;
  isRaidConfirmOpen.value = true;
}

async function saveRaid(input: RaidInput) {
  isSaving.value = true;
  const saved = await raidsStore.save(editingRaid.value?.id ?? null, input);
  isSaving.value = false;

  if (saved) isRaidFormOpen.value = false;
}

async function confirmRemoveRaid() {
  if (!removingRaid.value) return;

  isSaving.value = true;
  const removed = await raidsStore.remove(removingRaid.value.id);
  isSaving.value = false;

  if (removed) isRaidConfirmOpen.value = false;
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <ThemePanel class="col-span-2 lg:col-span-4" />
    <DiscordSettingsPanel class="col-span-2 lg:col-span-4" />
    <SyncSettingsPanel class="col-span-2 lg:col-span-4" />

    <UiPanel
      class="col-span-2 lg:col-span-4"
      title="Справочник классов"
      subtitle="Традиция, пробуждение и освобождение — разные классы"
      body-class="hidden"
    >
      <template #actions>
        <input v-model="query" type="search" class="input w-64" placeholder="Поиск" />
        <UiButton @click="openCreateClass">Добавить класс</UiButton>
      </template>
    </UiPanel>

    <UiStat label="Всего" :value="items.length" :is-loading="isLoading && !hasLoaded" />
    <UiStat
      label="Доступно"
      :value="active.length"
      hint="Видно при выборе класса"
      :is-loading="isLoading && !hasLoaded"
    />
    <UiStat label="Традиция" :value="successionCount" :is-loading="isLoading && !hasLoaded" />
    <UiStat label="Пробуждение" :value="awakeningCount" :is-loading="isLoading && !hasLoaded" />

    <div v-if="error" class="alert alert-error col-span-2 lg:col-span-4">{{ error }}</div>

    <UiPanel class="col-span-2 lg:col-span-4" body-class="p-0">
      <UiTable
        :items="visibleClasses"
        :columns="classColumns"
        row-key="id"
        :is-loading="isLoading"
        class="table-zebra table-pin-rows"
        wrapper-class="max-h-[32rem] overflow-y-auto"
        :row-class="(item) => (item.isActive ? '' : 'text-muted')"
      >
        <template #cell-displayName="{ item }">
          <span class="font-medium">{{ item.displayName }}</span>
        </template>

        <template #cell-path="{ item }">{{ PATH_LABEL[item.path] }}</template>

        <template #cell-isActive="{ item }">
          <input
            type="checkbox"
            class="toggle toggle-primary"
            :checked="item.isActive"
            @change="classesStore.toggleActive(item)"
          />
        </template>

        <template #cell-actions="{ item }">
          <div class="row-actions flex justify-end gap-1">
            <UiIconButton icon="edit" label="Изменить" @click="openEditClass(item)" />
            <UiIconButton icon="trash" label="Удалить" class="text-error" @click="askRemoveClass(item)" />
          </div>
        </template>

        <template #empty>Классов нет</template>
      </UiTable>
    </UiPanel>

    <UiPanel
      class="col-span-2 lg:col-span-4"
      title="Рейды"
      :subtitle="`Игрок может состоять в рейде, а может и не состоять · доступно ${activeRaids.length} из ${raids.length}`"
      body-class="hidden"
    >
      <template #actions>
        <UiButton @click="openCreateRaid">Добавить рейд</UiButton>
      </template>
    </UiPanel>

    <div v-if="raidsError" class="alert alert-error col-span-2 lg:col-span-4">{{ raidsError }}</div>

    <UiPanel class="col-span-2 lg:col-span-4" body-class="p-0">
      <UiTable
        :items="raids"
        :columns="raidColumns"
        row-key="id"
        :is-loading="isRaidsLoading"
        class="table-zebra"
        :row-class="(item) => (item.isActive ? '' : 'text-muted')"
      >
        <template #cell-name="{ item }">
          <span class="font-medium">{{ item.name }}</span>
        </template>

        <template #cell-isActive="{ item }">
          <input
            type="checkbox"
            class="toggle toggle-primary"
            :checked="item.isActive"
            @change="raidsStore.toggleActive(item)"
          />
        </template>

        <template #cell-actions="{ item }">
          <div class="row-actions flex justify-end gap-1">
            <UiIconButton icon="edit" label="Изменить" @click="openEditRaid(item)" />
            <UiIconButton icon="trash" label="Удалить" class="text-error" @click="askRemoveRaid(item)" />
          </div>
        </template>

        <template #empty>Рейдов нет — добавьте первый</template>
      </UiTable>
    </UiPanel>

    <ClassFormModal
      v-model="isClassFormOpen"
      :game-class="editingClass"
      :is-saving="isSaving"
      @save="saveClass"
    />

    <UiConfirm
      v-model="isClassConfirmOpen"
      title="Удалить класс"
      :message="`Удалить «${removingClass?.displayName}»? Если класс уже используют игроки, его получится только отключить.`"
      confirm-text="Удалить"
      :is-loading="isSaving"
      @confirm="confirmRemoveClass"
    />

    <RaidFormModal v-model="isRaidFormOpen" :raid="editingRaid" :is-saving="isSaving" @save="saveRaid" />

    <UiConfirm
      v-model="isRaidConfirmOpen"
      title="Удалить рейд"
      :message="`Удалить «${removingRaid?.name}»? Если рейд уже назначен игрокам, его получится только отключить.`"
      confirm-text="Удалить"
      :is-loading="isSaving"
      @confirm="confirmRemoveRaid"
    />
  </div>
</template>
