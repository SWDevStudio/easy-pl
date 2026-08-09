<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { UiButton, UiPanel } from "@/components/ui";
import { useSyncStore } from "@/stores/sync";

const syncStore = useSyncStore();
const { url, revision, syncedAt, tokenSaved, isBusy, isReady, error, report } = storeToRefs(syncStore);

const token = ref("");
const urlDraft = ref("");

const lastSync = computed(() => {
  if (!syncedAt.value) return "ещё ни разу";

  const parsed = new Date(syncedAt.value);

  return Number.isNaN(parsed.getTime()) ? syncedAt.value : parsed.toLocaleString("ru-RU");
});

onMounted(async () => {
  await syncStore.load();
  urlDraft.value = url.value;
});

async function submitToken() {
  const saved = await syncStore.saveToken(token.value);

  if (saved) token.value = "";
}
</script>

<template>
  <UiPanel title="Синхронизация" subtitle="Общая база через Cloudflare — состав и осады на всех машинах">
    <div class="flex flex-col gap-5">
      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <div v-if="report" class="alert alert-success">
        Отправлено записей: {{ report.sent }}, принято: {{ report.received }}.
      </div>

      <fieldset class="fieldset">
        <label class="fieldset-legend text-sm" for="sync-url">Адрес сервера</label>

        <div class="flex flex-wrap items-center gap-2">
          <input
            id="sync-url"
            v-model="urlDraft"
            class="input w-full max-w-md"
            placeholder="https://easy-pl-sync.ваш-аккаунт.workers.dev"
          />
          <UiButton class="btn-ghost" :is-loading="isBusy" @click="syncStore.setUrl(urlDraft)">
            Сохранить
          </UiButton>
        </div>

        <p class="text-muted text-sm">Адрес Worker'а, который вы развернули в Cloudflare.</p>
      </fieldset>

      <fieldset class="fieldset">
        <label class="fieldset-legend text-sm" for="sync-token">Ключ синхронизации</label>

        <div class="flex flex-wrap items-center gap-2">
          <input
            id="sync-token"
            v-model="token"
            type="password"
            class="input w-full max-w-md"
            :placeholder="tokenSaved ? 'Сохранён — введите новый, чтобы заменить' : 'Общий ключ'"
            autocomplete="off"
          />
          <UiButton :disabled="!token.trim()" :is-loading="isBusy" @click="submitToken">Сохранить</UiButton>
          <UiButton v-if="tokenSaved" class="btn-ghost text-error" @click="syncStore.clearToken()">
            Удалить
          </UiButton>
        </div>

        <p class="text-muted text-sm">
          Один и тот же ключ у всех, кто пользуется приложением. Хранится в диспетчере учётных данных
          Windows, в базу не попадает.
        </p>
      </fieldset>

      <fieldset class="fieldset">
        <span class="fieldset-legend text-sm">Обмен данными</span>

        <div class="flex flex-wrap items-center gap-2">
          <UiButton :disabled="!isReady" :is-loading="isBusy" @click="syncStore.sync()">
            Синхронизировать
          </UiButton>
          <UiButton class="btn-ghost" :disabled="isBusy" @click="syncStore.forgetProgress()">
            Забыть прогресс
          </UiButton>
        </div>

        <p class="text-muted text-sm">
          Последняя синхронизация: {{ lastSync }} · ревизия сервера {{ revision }}.
          «Забыть прогресс» заставит приложение выгрузить и загрузить всё заново — пригодится, если
          данные разъехались.
        </p>
      </fieldset>
    </div>
  </UiPanel>
</template>
