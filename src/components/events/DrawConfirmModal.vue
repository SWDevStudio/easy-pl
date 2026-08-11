<script setup lang="ts">
import { computed } from "vue";
import { UiButton, UiConfirm, UiSelect } from "@/components/ui";
import { raidKeyOf } from "@/lottery/draw";
import type { EventParticipant, EventRaidSeats } from "@/db/types";

interface MoveTarget {
  raidId: number;
  label: string;
}

interface OverflowGroup {
  key: number;
  name: string;
  priority: number;
  slots: number;
  players: EventParticipant[];
  targets: MoveTarget[];
}

const props = defineProps<{
  seats: EventRaidSeats[];
  participants: EventParticipant[];
  slots: number;
  signedUp: number;
  isDrawn?: boolean;
  isBusy?: boolean;
}>();

const emit = defineEmits<{
  confirm: [seatPriorityOverQuota: boolean];
  lend: [item: EventParticipant, raidId: number];
  drop: [item: EventParticipant];
}>();

const isOpen = defineModel<boolean>({ default: false });

const overflows = computed(() => props.seats.filter((group) => group.priority > group.slots));

const extra = computed(() =>
  overflows.value.reduce((sum, group) => sum + group.priority - group.slots, 0),
);

const groups = computed<OverflowGroup[]>(() =>
  overflows.value.map((group) => ({
    key: raidKeyOf(group.raidId),
    name: nameOf(group.raidName),
    priority: group.priority,
    slots: group.slots,
    players: props.participants.filter(
      (item) =>
        item.isSignedUp && item.isPriority && raidKeyOf(item.raidId) === raidKeyOf(group.raidId),
    ),
    targets: props.seats.flatMap((item) =>
      item.raidId === null ||
      item.slots <= item.priority ||
      raidKeyOf(item.raidId) === raidKeyOf(group.raidId)
        ? []
        : [
            {
              raidId: item.raidId,
              label: `${nameOf(item.raidName)} — свободно ${item.slots - item.priority}`,
            },
          ],
    ),
  })),
);

const confirmText = computed(() => {
  if (extra.value) return "Вывести сверх квоты";

  return props.isDrawn ? "Переиграть" : "Разыграть";
});

function nameOf(raidName: string | null): string {
  return raidName ?? "Без рейда";
}

function pick(item: EventParticipant, raidId: unknown) {
  if (typeof raidId !== "number") return;

  emit("lend", item, raidId);
}
</script>

<template>
  <UiConfirm
    v-model="isOpen"
    :title="isDrawn ? 'Переиграть жребий' : 'Провести жеребьёвку'"
    :confirm-text="confirmText"
    confirm-class="btn-primary"
    :is-loading="isBusy"
    class="max-w-xl"
    @confirm="emit('confirm', extra > 0)"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p v-if="isDrawn">Прошлый результат и отметки явки будут стёрты, состав разыграется заново.</p>
      <p v-else>
        Разыграть {{ slots }} мест среди {{ signedUp }} заявившихся? Каждый рейд разыгрывает свою
        квоту, недобор остаётся пати-лидеру.
      </p>

      <template v-if="extra">
        <div class="alert alert-warning items-start text-sm">
          <div class="flex flex-col gap-1">
            <p class="font-semibold">Обязательных игроков больше, чем мест</p>
            <p v-for="group in groups" :key="group.key">
              {{ group.name }} — «точно идёт» у {{ group.priority }}, мест {{ group.slots }}
            </p>
            <p>
              Их можно вывести сверх квоты — тогда мест станет {{ slots + extra }} вместо
              {{ slots }} — или вывести в рейде, где места есть: только на эту осаду, рейд игрока
              в справочнике не меняется.
            </p>
          </div>
        </div>

        <div
          v-for="group in groups"
          :key="group.key"
          class="border-primary/15 flex flex-col gap-2 rounded-lg border p-3"
        >
          <p class="font-semibold">{{ group.name }}</p>

          <div
            v-for="player in group.players"
            :key="player.playerId"
            class="flex flex-wrap items-center gap-2"
          >
            <span class="grow font-medium">{{ player.familyName }}</span>

            <UiSelect
              v-if="group.targets.length"
              class="w-56"
              :options="group.targets"
              :model-value="undefined"
              :disabled="isBusy"
              option-value="raidId"
              placeholder="Вывести в рейде"
              @update:model-value="pick(player, $event)"
            />

            <UiButton class="btn-sm btn-ghost" :disabled="isBusy" @click="emit('drop', player)">
              Снять «точно идёт»
            </UiButton>
          </div>

          <p v-if="!group.targets.length" class="text-muted">
            Свободных мест в других рейдах нет — либо выводите сверх квоты, либо добавьте места в
            настройках осады
          </p>
        </div>
      </template>
    </div>
  </UiConfirm>
</template>
