<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { UiButton, UiPanel } from "@/components/ui";
import { useDiscordStore } from "@/stores/discord";

const discordStore = useDiscordStore();
const { guildId, emoji, members, membersLoadedAt, tokenSaved, guildName, isBusy, isLoadingMembers, error } =
  storeToRefs(discordStore);

const membersHint = computed(() => {
  if (isLoadingMembers.value) return "Загружаем...";
  if (membersLoadedAt.value === null) return "Список подтянется сам, когда понадобится";

  return `Загружено ${members.value.length}, обновлено в ${new Date(membersLoadedAt.value).toLocaleTimeString("ru-RU")}`;
});

const token = ref("");
const guildDraft = ref("");
const emojiDraft = ref("");

onMounted(async () => {
  await discordStore.load();
  guildDraft.value = guildId.value;
  emojiDraft.value = emoji.value;
});

async function submitToken() {
  const saved = await discordStore.saveToken(token.value);

  if (saved) token.value = "";
}

async function submitGuild() {
  await discordStore.saveGuild(guildDraft.value);
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
        <label class="fieldset-legend text-sm" for="discord-token">Токен бота</label>

        <div class="flex flex-wrap items-center gap-2">
          <input
            id="discord-token"
            v-model="token"
            type="password"
            class="input w-full max-w-md"
            :placeholder="tokenSaved ? 'Сохранён — введите новый, чтобы заменить' : 'Вставьте токен бота'"
            autocomplete="off"
          />
          <UiButton :disabled="!token.trim()" :is-loading="isBusy" @click="submitToken">Сохранить</UiButton>
          <UiButton v-if="tokenSaved" class="btn-ghost text-error" @click="discordStore.clearToken()">
            Удалить
          </UiButton>
        </div>

        <p class="text-muted text-sm">
          Хранится в диспетчере учётных данных Windows, а не в базе приложения — в резервные копии и
          синхронизацию он не попадёт.
          <span v-if="tokenSaved" class="text-success">Токен сохранён.</span>
          <span v-else>Токен не задан.</span>
        </p>
      </fieldset>

      <fieldset class="fieldset">
        <label class="fieldset-legend text-sm" for="discord-guild">ID сервера</label>

        <div class="flex flex-wrap items-center gap-2">
          <input
            id="discord-guild"
            v-model="guildDraft"
            class="input w-full max-w-md"
            placeholder="Правый клик по серверу → Копировать ID сервера"
            inputmode="numeric"
          />
          <UiButton class="btn-ghost" :is-loading="isBusy" @click="submitGuild">Сохранить</UiButton>
          <UiButton :disabled="!tokenSaved || !guildId" :is-loading="isBusy" @click="discordStore.check()">
            Проверить связь
          </UiButton>
        </div>

        <p v-if="guildName" class="text-success text-sm">Связь есть: «{{ guildName }}»</p>
        <p v-else class="text-muted text-sm">
          Включите «Режим разработчика» в настройках Discord, чтобы копировать ID.
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
            :disabled="!tokenSaved || !guildId"
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
