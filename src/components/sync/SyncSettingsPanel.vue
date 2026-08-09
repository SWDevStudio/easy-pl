<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useClipboard } from "@vueuse/core";
import { UiButton, UiPanel } from "@/components/ui";
import { useSyncStore } from "@/stores/sync";

const syncStore = useSyncStore();
const { url, revision, syncedAt, isBusy, isConnected, error, report } = storeToRefs(syncStore);
const { copy, copied } = useClipboard({ legacy: true });

const code = ref("");
const address = ref("");
const token = ref("");

const isClean = computed(() => !report.value || (!report.value.failed && !report.value.deferred));

const lastSync = computed(() => {
  if (!syncedAt.value) return "ещё ни разу";

  const parsed = new Date(syncedAt.value);

  return Number.isNaN(parsed.getTime()) ? syncedAt.value : parsed.toLocaleString("ru-RU");
});

onMounted(() => syncStore.load());

async function connect() {
  const connected = await syncStore.connect(code.value);

  if (connected) code.value = "";
}

async function connectFirst() {
  const connected = await syncStore.connectManually(address.value, token.value);

  if (connected) token.value = "";
}

async function copyCode() {
  const value = await syncStore.readCode();

  if (value) await copy(value);
}
</script>

<template>
  <UiPanel
    title="Синхронизация"
    subtitle="Общая база: состав гильдии и осады одинаковые на всех компьютерах"
  >
    <div class="flex flex-col gap-5">
      <div v-if="error" class="alert alert-error">{{ error }}</div>

      <div v-if="report" class="alert" :class="isClean ? 'alert-success' : 'alert-warning'">
        <div class="flex flex-col gap-1">
          <span>Отправлено записей: {{ report.sent }}, принято: {{ report.received }}.</span>
          <span v-if="report.deferred" class="text-sm">
            Отложено осад: {{ report.deferred }} — ждут игроков, которые ещё не доехали. Синхронизируйтесь
            ещё раз.
          </span>
          <span v-if="report.failed" class="text-sm">
            Не удалось применить записей: {{ report.failed }}. Чаще всего это совпавшие имена — проверьте
            список гильдии.
          </span>
        </div>
      </div>

      <template v-if="isConnected">
        <div class="flex flex-wrap items-center gap-3">
          <span class="badge badge-success">Подключено</span>
          <span class="font-mono text-sm break-all">{{ url }}</span>
        </div>

        <p class="text-muted text-sm">
          Последняя синхронизация: {{ lastSync }} · ревизия сервера {{ revision }}
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <UiButton :is-loading="isBusy" @click="syncStore.sync()">Синхронизировать</UiButton>
          <UiButton class="btn-ghost" @click="copyCode">
            {{ copied ? "Скопировано" : "Скопировать код подключения" }}
          </UiButton>
          <UiButton class="btn-ghost text-error" :disabled="isBusy" @click="syncStore.disconnect()">
            Отключить
          </UiButton>
        </div>

        <p class="text-muted text-sm">
          Код подключения передайте остальным — им достаточно вставить его у себя, больше ничего
          настраивать не нужно.
        </p>

        <details class="collapse-arrow border-base-300 collapse border">
          <summary class="collapse-title text-sm font-semibold">Данные разъехались</summary>
          <div class="collapse-content flex flex-col items-start gap-2">
            <p class="text-muted text-sm">
              «Забыть прогресс» заставит приложение выгрузить и загрузить всё заново. Записи не
              пропадут: сойдутся по своим постоянным идентификаторам.
            </p>
            <UiButton class="btn-ghost btn-sm" :disabled="isBusy" @click="syncStore.forgetProgress()">
              Забыть прогресс
            </UiButton>
          </div>
        </details>
      </template>

      <template v-else>
        <fieldset class="fieldset">
          <label class="fieldset-legend text-sm" for="sync-code">Код подключения</label>

          <div class="flex flex-wrap items-start gap-2">
            <textarea
              id="sync-code"
              v-model="code"
              class="textarea h-24 w-full max-w-xl font-mono text-sm"
              placeholder="EASYPL1-…"
              spellcheck="false"
            />
            <UiButton :disabled="!code.trim()" :is-loading="isBusy" @click="connect">
              Подключиться
            </UiButton>
          </div>

          <p class="text-muted text-sm">
            Код даёт тот, кто заводил общую базу. Вставьте его целиком, одной строкой — адрес и ключ
            приложение достанет само и сразу проверит связь.
          </p>
        </fieldset>

        <details class="collapse-arrow border-base-300 collapse border">
          <summary class="collapse-title text-sm font-semibold">Я завожу общую базу первым</summary>
          <div class="collapse-content flex flex-col gap-3">
            <p class="text-muted text-sm">
              Адрес и ключ вы получили, когда разворачивали сервер. Введите их один раз — дальше
              приложение соберёт код подключения, который останется разослать остальным.
            </p>

            <input
              v-model="address"
              class="input w-full max-w-xl"
              placeholder="https://easy-pl-sync.ваш-аккаунт.workers.dev"
              spellcheck="false"
            />
            <input
              v-model="token"
              type="password"
              class="input w-full max-w-xl"
              placeholder="Ключ синхронизации"
              autocomplete="off"
            />

            <UiButton
              class="self-start"
              :disabled="!address.trim() || !token.trim()"
              :is-loading="isBusy"
              @click="connectFirst"
            >
              Подключиться
            </UiButton>
          </div>
        </details>
      </template>
    </div>
  </UiPanel>
</template>
