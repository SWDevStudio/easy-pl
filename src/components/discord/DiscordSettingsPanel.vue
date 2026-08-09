<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { openUrl } from "@tauri-apps/plugin-opener";
import { UiButton, UiPanel, UiSelect } from "@/components/ui";
import { useDiscordStore } from "@/stores/discord";

const discordStore = useDiscordStore();
const { guildId, emoji, members, membersLoadedAt, bot, guilds, guildName, isBusy, isLoadingMembers, error } =
  storeToRefs(discordStore);

const emojiDraft = ref("");
const inviteOpened = ref(false);

const membersHint = computed(() => {
  if (isLoadingMembers.value) return "Загружаем...";
  if (membersLoadedAt.value === null) return "Список подтянется сам, когда понадобится";

  return `Загружено ${members.value.length}, обновлено в ${new Date(membersLoadedAt.value).toLocaleTimeString("ru-RU")}`;
});

onMounted(async () => {
  await discordStore.load();
  emojiDraft.value = emoji.value;
  await discordStore.connect();
});

async function invite() {
  if (!bot.value) return;

  await openUrl(bot.value.inviteUrl);
  inviteOpened.value = true;
}

async function submitEmoji() {
  await discordStore.saveEmoji(emojiDraft.value);
  emojiDraft.value = emoji.value;
}
</script>

<template>
  <UiPanel title="Discord" subtitle="Бот собирает заявки прямо из вашего сервера">
    <div class="flex flex-col gap-5">
      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <fieldset class="fieldset">
        <span class="fieldset-legend text-sm">Бот</span>

        <div class="flex flex-wrap items-center gap-3">
          <template v-if="bot">
            <span class="badge badge-success">Подключён</span>
            <span class="font-medium">{{ bot.username }}</span>
            <UiButton class="btn-ghost" @click="invite">Добавить на сервер</UiButton>
          </template>
          <template v-else>
            <span class="badge badge-ghost">Не подключён</span>
            <UiButton class="btn-ghost" :is-loading="isBusy" @click="discordStore.connect()">
              Проверить ещё раз
            </UiButton>
          </template>
        </div>

        <p class="text-muted text-sm">
          Токен бота живёт на сервере синхронизации, а не на компьютерах — вводить его здесь не нужно.
          «Добавить на сервер» откроет страницу Discord, где нужно выбрать свой сервер и подтвердить
          доступ.
          <span v-if="inviteOpened">После добавления нажмите «Проверить ещё раз».</span>
        </p>
      </fieldset>

      <fieldset class="fieldset">
        <span class="fieldset-legend text-sm">Сервер</span>

        <div class="flex flex-wrap items-center gap-2">
          <UiSelect
            :model-value="guildId"
            :options="guilds"
            option-value="id"
            option-label="name"
            class="w-full max-w-md"
            placeholder="Выберите сервер"
            searchable
            @update:model-value="(value) => discordStore.saveGuild(String(value ?? ''))"
          >
            <template #empty>Бот пока не добавлен ни на один сервер</template>
          </UiSelect>
          <UiButton class="btn-ghost" :is-loading="isBusy" @click="discordStore.connect()">Обновить</UiButton>
        </div>

        <p v-if="guildName" class="text-success text-sm">Заявки читаются с сервера «{{ guildName }}»</p>
        <p v-else class="text-muted text-sm">
          В списке — серверы, на которые бот уже добавлен. Идентификаторы копировать не нужно.
        </p>
      </fieldset>

      <fieldset class="fieldset">
        <label class="fieldset-legend text-sm" for="discord-emoji">Эмодзи заявки</label>

        <div class="flex flex-wrap items-center gap-2">
          <input id="discord-emoji" v-model="emojiDraft" class="input w-24" placeholder="✅" />
          <UiButton class="btn-ghost" :is-loading="isBusy" @click="submitEmoji">Сохранить</UiButton>
        </div>

        <p class="text-muted text-sm">
          Реакцию с этим эмодзи приложение считает заявкой на осаду. Сейчас: {{ emoji }}
        </p>
      </fieldset>

      <fieldset class="fieldset">
        <span class="fieldset-legend text-sm">Участники сервера</span>

        <div class="flex flex-wrap items-center gap-2">
          <UiButton
            class="btn-ghost"
            :disabled="!guildId"
            :is-loading="isLoadingMembers"
            @click="discordStore.ensureMembers(true)"
          >
            Обновить список
          </UiButton>
          <span class="text-muted text-sm">{{ membersHint }}</span>
        </div>

        <p class="text-muted text-sm">
          Список подтягивается автоматически при первом обращении и живёт 5 минут, поэтому Discord не
          дёргается на каждую карточку игрока.
        </p>
      </fieldset>
    </div>
  </UiPanel>
</template>
