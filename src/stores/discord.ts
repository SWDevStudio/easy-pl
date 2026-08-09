import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { readSettings, writeSetting } from "@/db/repositories/settings";
import * as discord from "@/services/discord";

const GUILD_KEY = "discord.guildId";
const EMOJI_KEY = "discord.emoji";
const DEFAULT_EMOJI = "✅";
const MEMBERS_TTL_MS = 5 * 60 * 1000;

export const useDiscordStore = defineStore("discord", () => {
  const guildId = ref("");
  const emoji = ref(DEFAULT_EMOJI);
  const members = ref<discord.DiscordUser[]>([]);
  const membersLoadedAt = ref<number | null>(null);
  const bot = ref<discord.DiscordBot | null>(null);
  const guilds = ref<discord.DiscordGuild[]>([]);
  const settingsLoaded = ref(false);
  const isBusy = ref(false);
  const isLoadingMembers = ref(false);
  const error = ref<string | null>(null);

  let membersRequest: Promise<void> | null = null;

  const isReady = computed(() => bot.value !== null && guildId.value.trim().length > 0);
  const guildName = computed(() => guilds.value.find((item) => item.id === guildId.value)?.name ?? null);
  const membersFresh = computed(
    () => membersLoadedAt.value !== null && Date.now() - membersLoadedAt.value < MEMBERS_TTL_MS,
  );

  async function load() {
    try {
      const settings = await readSettings();

      guildId.value = settings[GUILD_KEY] ?? "";
      emoji.value = settings[EMOJI_KEY] ?? DEFAULT_EMOJI;
      settingsLoaded.value = true;
      error.value = null;
    } catch (cause) {
      error.value = messageOf(cause);
    }
  }

  async function connect() {
    return run(async () => {
      bot.value = await discord.bot();
      guilds.value = await discord.listGuilds();

      const only = guilds.value.length === 1 ? guilds.value[0] : undefined;

      if (only && guildId.value !== only.id) await selectGuild(only.id);
    });
  }

  async function ensureMembers(force = false): Promise<void> {
    if (!settingsLoaded.value) await load();
    if (!guildId.value) return;
    if (!force && membersFresh.value) return;
    if (membersRequest) return membersRequest;

    membersRequest = fetchMembers();

    try {
      await membersRequest;
    } finally {
      membersRequest = null;
    }
  }

  async function fetchMembers(): Promise<void> {
    isLoadingMembers.value = true;

    try {
      members.value = await discord.listMembers(guildId.value);
      membersLoadedAt.value = Date.now();
      error.value = null;
    } catch (cause) {
      error.value = messageOf(cause);
    } finally {
      isLoadingMembers.value = false;
    }
  }

  function dropMembersCache() {
    members.value = [];
    membersLoadedAt.value = null;
  }

  async function selectGuild(value: string) {
    guildId.value = value.trim();

    await writeSetting(GUILD_KEY, guildId.value);
    dropMembersCache();
  }

  async function saveGuild(value: string) {
    return run(() => selectGuild(value));
  }

  async function saveEmoji(value: string) {
    return run(async () => {
      emoji.value = value.trim() || DEFAULT_EMOJI;
      await writeSetting(EMOJI_KEY, emoji.value);
    });
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    isBusy.value = true;

    try {
      await action();
      error.value = null;

      return true;
    } catch (cause) {
      error.value = messageOf(cause);

      return false;
    } finally {
      isBusy.value = false;
    }
  }

  return {
    guildId,
    emoji,
    members,
    membersLoadedAt,
    membersFresh,
    bot,
    guilds,
    guildName,
    isBusy,
    isLoadingMembers,
    isReady,
    error,
    load,
    connect,
    ensureMembers,
    saveGuild,
    saveEmoji,
  };
});

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
