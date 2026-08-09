<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { UiButton, UiModal, UiSelect } from "@/components/ui";
import { importSignups, linkPlayerToDiscord, type ImportResult } from "@/db/repositories/discordLink";
import * as discord from "@/services/discord";
import { useDiscordStore } from "@/stores/discord";
import type { EventParticipant } from "@/db/types";

const props = defineProps<{
  eventId: number;
  participants: EventParticipant[];
}>();

const emit = defineEmits<{ imported: [] }>();

const isOpen = defineModel<boolean>({ default: false });

const discordStore = useDiscordStore();
const { guildId, emoji, isReady } = storeToRefs(discordStore);

const channels = ref<discord.DiscordChannel[]>([]);
const messages = ref<discord.DiscordMessage[]>([]);
const channelId = ref("");
const selected = ref<discord.DiscordMessage | null>(null);
const reactionKey = ref("");
const result = ref<ImportResult | null>(null);
const binding = ref<Record<string, number | null>>({});
const isBusy = ref(false);
const error = ref<string | null>(null);

const step = computed(() => {
  if (result.value) return "result";
  if (selected.value) return "reaction";

  return "pick";
});

watch(isOpen, async (open) => {
  if (!open) return;

  reset();
  await discordStore.load();

  if (isReady.value) await loadChannels();
});

function reset() {
  channels.value = [];
  messages.value = [];
  channelId.value = "";
  selected.value = null;
  reactionKey.value = "";
  result.value = null;
  binding.value = {};
  error.value = null;
}

async function loadChannels() {
  await run(async () => {
    channels.value = await discord.listChannels(guildId.value);
  });
}

watch(channelId, async (id) => {
  selected.value = null;
  messages.value = [];

  if (!id) return;

  await run(async () => {
    messages.value = await discord.listMessages(id, 10);
  });
});

function pickMessage(message: discord.DiscordMessage) {
  selected.value = message;
  reactionKey.value =
    message.reactions.find((item) => item.label === emoji.value)?.key ?? message.reactions[0]?.key ?? "";
}

async function importReactions() {
  const message = selected.value;
  if (!message || !reactionKey.value) return;

  await run(async () => {
    const users = await discord.reactionUsers(channelId.value, message.id, reactionKey.value);
    result.value = await importSignups(props.eventId, users);
    emit("imported");
  });
}

async function bind(user: discord.DiscordUser) {
  const playerId = binding.value[user.id];
  if (!playerId) return;

  await run(async () => {
    await linkPlayerToDiscord(playerId, user, props.eventId);

    if (result.value) {
      const player = props.participants.find((item) => item.playerId === playerId);

      result.value.linked.push({
        playerId,
        familyName: player?.familyName ?? "",
        user,
        matchedBy: "id",
      });
      result.value.unknown = result.value.unknown.filter((item) => item.id !== user.id);
    }

    emit("imported");
  });
}

async function run(action: () => Promise<void>) {
  isBusy.value = true;

  try {
    await action();
    error.value = null;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    isBusy.value = false;
  }
}

function preview(message: discord.DiscordMessage): string {
  const text = message.content.trim();

  if (!text) return "(текст недоступен — включите Message Content Intent)";

  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function formatTime(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("ru-RU");
}
</script>

<template>
  <UiModal v-model="isOpen" title="Заявки из Discord" class="max-w-3xl">
    <div class="flex flex-col gap-4">
      <div v-if="!isReady" class="alert alert-warning">
        Сначала укажите токен бота и ID сервера в «Справочниках».
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <template v-if="isReady && step === 'pick'">
        <label class="fieldset-legend text-sm">Канал</label>
        <UiSelect
          v-model="channelId"
          :options="channels"
          option-value="id"
          option-label="name"
          searchable
          search-placeholder="Название канала"
          placeholder="Выберите канал"
          :disabled="isBusy"
        >
          <template #default="{ value }">#{{ value.name }}</template>
          <template #selected="{ value }">#{{ value.name }}</template>
          <template #empty>Текстовых каналов не найдено</template>
        </UiSelect>

        <div v-if="channelId" class="flex flex-col gap-2">
          <p class="text-muted text-sm">Последние 10 сообщений — выберите то, с которого считать реакции</p>

          <div class="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          <button
            v-for="message in messages"
            :key="message.id"
            type="button"
            class="border-primary/20 hover:border-primary/50 hover:bg-base-300 rounded-box border p-3 text-left"
            @click="pickMessage(message)"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium">{{ message.author }}</span>
              <span class="text-muted text-sm">{{ formatTime(message.timestamp) }}</span>
            </div>
            <p class="text-muted mt-1 text-sm">{{ preview(message) }}</p>
            <div v-if="message.reactions.length" class="mt-2 flex flex-wrap gap-1">
              <span v-for="item in message.reactions" :key="item.key" class="badge badge-soft">
                {{ item.label }} {{ item.count }}
              </span>
            </div>
            <p v-else class="text-muted/60 mt-2 text-sm">Реакций нет</p>
          </button>
          </div>

          <p v-if="!messages.length && !isBusy" class="text-muted text-sm">В канале нет сообщений</p>
        </div>
      </template>

      <template v-else-if="step === 'reaction'">
        <div class="border-primary/20 rounded-box border p-3">
          <span class="font-medium">{{ selected?.author }}</span>
          <p class="text-muted mt-1 text-sm">{{ selected ? preview(selected) : "" }}</p>
        </div>

        <div v-if="selected?.reactions.length" class="flex flex-col gap-2">
          <span class="fieldset-legend text-sm">Какая реакция считается заявкой</span>
          <div class="flex flex-wrap gap-2">
            <UiButton
              v-for="item in selected.reactions"
              :key="item.key"
              :class="reactionKey === item.key ? 'btn-primary' : 'btn-ghost'"
              @click="reactionKey = item.key"
            >
              {{ item.label }} · {{ item.count }}
            </UiButton>
          </div>
        </div>
        <div v-else class="alert alert-warning">На этом сообщении нет реакций</div>
      </template>

      <template v-else-if="step === 'result' && result">
        <div class="alert alert-success">
          Заявлено: {{ result.linked.length }}. Уже были в составе: {{ result.alreadySignedUp }}.
        </div>

        <div v-if="result.unknown.length" class="flex flex-col gap-2">
          <div class="alert alert-warning">
            Не удалось опознать: {{ result.unknown.length }}. Привяжите вручную — приложение запомнит.
          </div>

          <div
            v-for="user in result.unknown"
            :key="user.id"
            class="border-warning/40 rounded-box flex flex-wrap items-center gap-2 border p-3"
          >
            <span class="grow">
              Игрок с ником в дискорд «<span class="font-medium">{{ user.username }}</span
              >» не найден
              <span v-if="user.displayName !== user.username" class="text-muted">
                ({{ user.displayName }})
              </span>
            </span>

            <UiSelect
              v-model="binding[user.id]"
              class="w-56"
              :options="participants"
              option-value="playerId"
              option-label="familyName"
              searchable
              search-placeholder="Фамилия"
              placeholder="Выберите игрока"
            />

            <UiButton class="btn-sm" :disabled="!binding[user.id]" @click="bind(user)">Привязать</UiButton>
          </div>
        </div>

        <div v-else class="text-muted text-sm">Все, кто отреагировал, опознаны.</div>
      </template>
    </div>

    <template #footer="{ close }">
      <UiButton v-if="step === 'reaction'" class="btn-ghost" @click="selected = null">Назад</UiButton>
      <UiButton
        v-if="step === 'reaction'"
        :disabled="!reactionKey"
        :is-loading="isBusy"
        @click="importReactions"
      >
        Заявить отреагировавших
      </UiButton>
      <UiButton v-else class="btn-ghost" @click="close">Закрыть</UiButton>
    </template>
  </UiModal>
</template>
