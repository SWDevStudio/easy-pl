<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import DiscordSignupsModal from "@/components/discord/DiscordSignupsModal.vue";
import DrawConfirmModal from "@/components/events/DrawConfirmModal.vue";
import EventFormModal from "@/components/events/EventFormModal.vue";
import DebtHint from "@/components/players/DebtHint.vue";
import { UiButton, UiConfirm, UiPanel, UiStat, UiTable, type TableColumn } from "@/components/ui";
import { useEventsStore } from "@/stores/events";
import { useRaidsStore } from "@/stores/raids";
import type { EventInput, EventParticipant, EventRaidSeats, EventStatus } from "@/db/types";

const route = useRoute();
const eventsStore = useEventsStore();
const raidsStore = useRaidsStore();
const {
  current,
  participants,
  raidSeats,
  signedUp,
  roster,
  unmarked,
  freeSeats,
  isLoading,
  isBusy,
  error,
} = storeToRefs(eventsStore);

const isDiscordOpen = ref(false);
const isEditOpen = ref(false);
const isDrawConfirmOpen = ref(false);
const isCloseConfirmOpen = ref(false);
const query = ref("");

const STATUS: Record<EventStatus, { label: string; badge: string }> = {
  draft: { label: "Набор состава", badge: "badge-ghost" },
  drawn: { label: "Жребий брошен", badge: "badge-warning badge-soft" },
  closed: { label: "Закрыта", badge: "badge-success badge-soft" },
};

const eventId = computed(() => Number(route.params.id));
const isFirstLoad = computed(() => isLoading.value && current.value === null);
const isDraft = computed(() => current.value?.status === "draft");
const isDrawn = computed(() => current.value?.status === "drawn");
const priorityCount = computed(() => signedUp.value.filter((item) => item.isPriority).length);
const canDraw = computed(
  () => signedUp.value.length > 0 && ((current.value?.slots ?? 0) > 0 || priorityCount.value > 0),
);
const noShows = computed(() => roster.value.filter((item) => item.showedUp === false).length);
const occupied = computed(() => roster.value.length - noShows.value);
const shortfall = computed(() =>
  raidSeats.value.reduce((sum, group) => sum + Math.max(0, group.slots - group.signedUp), 0),
);

const seatColumns = computed<TableColumn<EventRaidSeats>[]>(() => [
  { key: "raidName", label: "Рейд" },
  { key: "slots", label: "Мест", headerClass: "text-right", class: "text-right", width: "7rem" },
  { key: "signedUp", label: "Заявились", headerClass: "text-right", class: "text-right", width: "9rem" },
  { key: "priority", label: "Вне жребия", headerClass: "text-right", class: "text-right", width: "9rem" },
  { key: "taken", label: "В составе", headerClass: "text-right", class: "text-right", width: "9rem" },
  {
    key: "unfilled",
    label: "За пати-лидером",
    headerClass: "text-right",
    class: "text-right",
    width: "11rem",
    sortValue: unfilledOf,
  },
]);

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const list = isDraft.value ? participants.value : participants.value.filter((item) => item.isSignedUp);

  if (!needle) return list;

  return list.filter((item) => item.familyName.toLowerCase().includes(needle));
});

const columns = computed<TableColumn<EventParticipant>[]>(() => [
  { key: "familyName", label: "Фамилия" },
  { key: "className", label: "Класс" },
  { key: "raidName", label: "Рейд", width: "13rem" },
  { key: "debt", label: "Долг", headerClass: "text-right", class: "text-right", width: "6rem" },
  ...(isDraft.value
    ? [
        { key: "signup", label: "Заявился", width: "8rem", sortValue: signupValue },
        { key: "priority", label: "Точно идёт", width: "9rem", sortValue: priorityValue },
      ]
    : [
        { key: "slot", label: "Слот", width: "10rem", sortValue: slotValue },
        { key: "attendance", label: "Явка", width: "13rem", sortValue: attendanceValue },
      ]),
]);

onMounted(() => {
  eventsStore.open(eventId.value);
  if (!raidsStore.hasLoaded) raidsStore.load();
});

watch(eventId, (id) => eventsStore.open(id));

async function saveEvent(input: EventInput) {
  const saved = await eventsStore.update(eventId.value, input);

  if (saved) isEditOpen.value = false;
}

async function confirmDraw(seatPriorityOverQuota: boolean) {
  const done = await eventsStore.runDraw({ seatPriorityOverQuota });

  if (done) isDrawConfirmOpen.value = false;
}

async function confirmClose() {
  const done = await eventsStore.close();

  if (done) isCloseConfirmOpen.value = false;
}

function formatDebt(debt: number): string {
  const rounded = debt.toFixed(1);

  return rounded === "-0.0" ? "0.0" : rounded;
}

function slotLabel(item: EventParticipant): string {
  if (item.slotSource === "priority") return "Вне жребия";
  if (item.slotSource === "manual") return "Заменил";
  if (item.slotSource === "fallback") return "Добор";
  if (item.slotSource !== null) return "В составе";

  return "Не прошёл";
}

function signupValue(item: EventParticipant): boolean {
  return item.isSignedUp;
}

function priorityValue(item: EventParticipant): boolean {
  return item.isPriority;
}

function slotValue(item: EventParticipant): number {
  return item.slotSource === null ? 1 : 0;
}

function attendanceValue(item: EventParticipant): number | null {
  if (item.slotSource === null) return null;
  if (item.showedUp === true) return 0;
  if (item.showedUp === false) return 2;

  return 1;
}

function slotBadge(item: EventParticipant): string {
  if (item.slotSource === "priority") return "badge-primary badge-soft";
  if (item.slotSource === "manual") return "badge-info badge-soft";
  if (item.slotSource !== null) return "badge-success badge-soft";

  return "badge-ghost";
}

function unfilledOf(group: EventRaidSeats): number {
  return Math.max(0, group.slots - group.taken);
}

function seatsHint(item: EventParticipant): string {
  const group = eventsStore.seatsOf(item.raidId);
  const where = item.raidName === null ? "у игроков без рейда" : `в рейде «${item.raidName}»`;

  if (!group || group.slots === 0) return `Мест ${where} не выделено`;
  if (eventsStore.freeSeatsOf(item.raidId) === 0) return `Свободных мест ${where} нет`;

  return `Отдать освободившееся место ${where}`;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiPanel :title="current?.title ?? 'Осада'" body-class="hidden">
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <RouterLink to="/events" class="text-muted hover:text-primary text-sm">← Все осады</RouterLink>
          <h2 class="panel-title">{{ current?.title ?? "Осада" }}</h2>
          <span v-if="current" class="badge" :class="STATUS[current.status].badge">
            {{ STATUS[current.status].label }}
          </span>
        </div>
        <p v-if="current" class="text-muted mt-1 text-sm">
          {{ current.eventDate }} · мест {{ current.slots }}
        </p>
      </template>

      <template #actions>
        <UiButton v-if="current && current.status !== 'closed'" class="btn-ghost" @click="isEditOpen = true">
          Изменить
        </UiButton>

        <template v-if="isDraft">
          <UiButton class="btn-ghost" :is-loading="isBusy" @click="eventsStore.signUpEveryone()">
            Заявить всех
          </UiButton>
          <UiButton class="btn-ghost" :is-loading="isBusy" @click="eventsStore.clearSignups()">
            Снять всех
          </UiButton>
          <UiButton class="btn-ghost" @click="isDiscordOpen = true">Посмотреть по реакциям</UiButton>
          <UiButton
            :disabled="!canDraw"
            :title="canDraw ? undefined : 'Сначала укажите места по рейдам'"
            @click="isDrawConfirmOpen = true"
          >
            Провести жеребьёвку
          </UiButton>
        </template>

        <template v-else-if="isDrawn">
          <UiButton class="btn-ghost" @click="isDrawConfirmOpen = true">Переиграть жребий</UiButton>
          <UiButton @click="isCloseConfirmOpen = true">Закрыть осаду</UiButton>
        </template>
      </template>
    </UiPanel>

    <div v-if="error" class="alert alert-error">{{ error }}</div>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UiStat
        label="Заявились"
        :value="signedUp.length"
        :hint="`из ${participants.length} в гильдии`"
        :is-loading="isFirstLoad"
      />
      <UiStat
        label="Вне жребия"
        :value="priorityCount"
        hint="Указаны как обязательные"
        :is-loading="isFirstLoad"
      />
      <UiStat
        label="В составе"
        :value="isDraft ? '—' : `${occupied} / ${current?.slots ?? 0}`"
        :hint="
          isDraft
            ? shortfall
              ? `не хватает заявок: ${shortfall}`
              : 'заявок хватает на все места'
            : freeSeats
              ? `свободно ${freeSeats}`
              : 'мест нет'
        "
        :is-loading="isFirstLoad"
      />
      <UiStat
        label="Явка"
        :value="isDraft ? '—' : `${roster.filter((item) => item.showedUp === true).length}`"
        :hint="isDraft ? 'После жеребьёвки' : `не отмечено ${unmarked}, прогулов ${noShows}`"
        :is-loading="isFirstLoad"
      />
    </div>

    <UiPanel body-class="p-0">
      <template #header>
        <h3 class="panel-title">Места по рейдам</h3>
        <p class="text-muted mt-1 text-sm">
          Каждый рейд разыгрывает свои места. Недобор остаётся пати-лидеру и другому рейду не уходит.
        </p>
      </template>

      <UiTable
        :items="raidSeats"
        :columns="seatColumns"
        :row-key="(group) => group.raidId ?? 0"
        :is-loading="isLoading"
        :page-size="25"
        class="table-zebra"
      >
        <template #cell-raidName="{ item }">
          <span v-if="item.raidName" class="font-medium">{{ item.raidName }}</span>
          <span v-else class="text-muted">Без рейда</span>
        </template>

        <template #cell-signedUp="{ item }">
          <span v-if="item.signedUp < item.slots" class="text-warning">
            {{ item.signedUp }}
            <span class="text-muted">из {{ item.slots }}</span>
          </span>
          <span v-else>{{ item.signedUp }}</span>
        </template>

        <template #cell-priority="{ item }">
          <span
            v-if="item.priority > item.slots"
            class="badge badge-warning badge-soft"
            :title="`Мест ${item.slots} — лишних выведут сверх квоты или переведут в другой рейд`"
          >
            {{ item.priority }}
          </span>
          <span v-else>{{ item.priority }}</span>
        </template>

        <template #cell-taken="{ item }">
          <span v-if="isDraft" class="text-muted/50">—</span>
          <span v-else>{{ item.taken }}</span>
        </template>

        <template #cell-unfilled="{ item }">
          <span v-if="isDraft" class="text-muted/50">—</span>
          <span v-else-if="unfilledOf(item)" class="badge badge-warning badge-soft">
            {{ unfilledOf(item) }}
          </span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #empty>Места не распределены — укажите их в настройках осады</template>
      </UiTable>
    </UiPanel>

    <UiPanel body-class="p-0">
      <template #header>
        <h3 class="panel-title">{{ isDraft ? "Кто идёт" : "Состав" }}</h3>
      </template>

      <template #actions>
        <input v-model="query" type="search" class="input w-64" placeholder="Поиск по фамилии" />
      </template>

      <UiTable
        :items="visible"
        :columns="columns"
        row-key="playerId"
        :is-loading="isLoading"
        class="table-zebra table-pin-rows"
        wrapper-class="max-h-[calc(100vh-30rem)] overflow-y-auto"
        :row-class="(item) => (item.isSignedUp || !isDraft ? '' : 'text-muted')"
      >
        <template #cell-familyName="{ item }">
          <span v-if="item.isFavorite" class="text-primary mr-1" title="Избранный игрок">★</span>
          <span class="font-medium">{{ item.familyName }}</span>
        </template>

        <template #header-debt>
          <span class="inline-flex items-center gap-1">Долг <DebtHint /></span>
        </template>

        <template #cell-className="{ item }">
          <span v-if="item.className">{{ item.className }}</span>
          <span v-else class="text-muted/50">—</span>
        </template>

        <template #cell-raidName="{ item }">
          <div class="flex flex-wrap items-center gap-1">
            <span v-if="item.raidName">{{ item.raidName }}</span>
            <span v-else class="text-muted">Без рейда</span>

            <button
              v-if="item.isRaidGuest && isDraft"
              type="button"
              class="badge badge-info badge-soft"
              title="Выведен в этот рейд только на эту осаду — вернуть в свой"
              :disabled="isBusy"
              @click="eventsStore.setSignupRaid(item, null)"
            >
              разово ✕
            </button>
            <span v-else-if="item.isRaidGuest" class="badge badge-info badge-soft">разово</span>
          </div>
        </template>

        <template #cell-debt="{ item }">
          <span :class="item.debt > 0.05 ? 'text-success' : item.debt < -0.05 ? 'text-muted' : ''">
            {{ formatDebt(item.debt) }}
          </span>
        </template>

        <template #cell-signup="{ item }">
          <input
            type="checkbox"
            class="checkbox checkbox-primary"
            :checked="item.isSignedUp"
            :disabled="isBusy"
            @change="eventsStore.toggleSignup(item)"
          />
        </template>

        <template #cell-priority="{ item }">
          <input
            type="checkbox"
            class="toggle toggle-primary"
            :checked="item.isPriority"
            :disabled="isBusy || !item.isSignedUp"
            @change="eventsStore.togglePriority(item)"
          />
        </template>

        <template #cell-slot="{ item }">
          <span class="badge" :class="slotBadge(item)">{{ slotLabel(item) }}</span>
        </template>

        <template #cell-attendance="{ item }">
          <div v-if="item.slotSource !== null" class="flex items-center gap-1">
            <UiButton
              class="btn-sm"
              :class="item.showedUp === true ? 'btn-success' : 'btn-ghost'"
              @click="eventsStore.mark(item, item.showedUp === true ? null : true)"
            >
              Пришёл
            </UiButton>
            <UiButton
              class="btn-sm"
              :class="item.showedUp === false ? 'btn-error' : 'btn-ghost'"
              @click="eventsStore.mark(item, item.showedUp === false ? null : false)"
            >
              Нет
            </UiButton>
            <UiButton
              class="btn-sm btn-ghost text-muted"
              title="Убрать из состава"
              @click="eventsStore.removeFromRoster(item)"
            >
              ✕
            </UiButton>
          </div>

          <UiButton
            v-else-if="item.isSignedUp"
            class="btn-sm btn-ghost"
            :class="{ 'text-muted': !eventsStore.freeSeatsOf(item.raidId) }"
            :title="seatsHint(item)"
            @click="eventsStore.addToRoster(item)"
          >
            В состав
          </UiButton>

          <span v-else class="text-muted/50">—</span>
        </template>

        <template #empty>{{ isDraft ? "В гильдии нет игроков" : "Никто не заявился" }}</template>
      </UiTable>
    </UiPanel>

    <EventFormModal
      v-model="isEditOpen"
      :event="current"
      :seats="raidSeats"
      :lock-slots="isDrawn"
      :is-saving="isBusy"
      @save="saveEvent"
    />

    <DiscordSignupsModal
      v-model="isDiscordOpen"
      :event-id="eventId"
      :participants="participants"
      @imported="eventsStore.open(eventId)"
    />

    <DrawConfirmModal
      v-model="isDrawConfirmOpen"
      :seats="raidSeats"
      :participants="participants"
      :slots="current?.slots ?? 0"
      :signed-up="signedUp.length"
      :is-drawn="isDrawn"
      :is-busy="isBusy"
      @confirm="confirmDraw"
      @lend="(item, raidId) => eventsStore.setSignupRaid(item, raidId)"
      @drop="(item) => eventsStore.togglePriority(item)"
    />

    <UiConfirm
      v-model="isCloseConfirmOpen"
      title="Закрыть осаду"
      :message="`Долги пересчитаются по итогам явки. Не отмечено игроков: ${unmarked}. После закрытия изменить ничего нельзя.`"
      confirm-text="Закрыть"
      confirm-class="btn-primary"
      :is-loading="isBusy"
      @confirm="confirmClose"
    />
  </div>
</template>
