import { call } from "./sync";

export interface DiscordUser {
  id: string;
  username: string;
  displayName: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
}

export interface DiscordReaction {
  key: string;
  label: string;
  count: number;
}

export interface DiscordMessage {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  reactions: DiscordReaction[];
}

export interface DiscordBot {
  id: string;
  username: string;
  inviteUrl: string;
}

export async function bot(): Promise<DiscordBot> {
  const raw = await call("/discord/bot");

  return {
    id: string(raw, "id"),
    username: string(raw, "username"),
    inviteUrl: string(raw, "inviteUrl"),
  };
}

export async function listGuilds(): Promise<DiscordGuild[]> {
  return named(await call("/discord/guilds"));
}

export async function listChannels(guildId: string): Promise<DiscordChannel[]> {
  return named(await call("/discord/channels", { guildId }));
}

export async function listMembers(guildId: string): Promise<DiscordUser[]> {
  return users(await call("/discord/members", { guildId }));
}

export async function listMessages(channelId: string, limit = 10): Promise<DiscordMessage[]> {
  const raw = await call("/discord/messages", { channelId, limit });

  return list(raw).map((item) => ({
    id: string(item, "id"),
    author: string(item, "author"),
    content: string(item, "content"),
    timestamp: string(item, "timestamp"),
    reactions: list(Reflect.get(Object(item), "reactions")).map((entry) => ({
      key: string(entry, "key"),
      label: string(entry, "label"),
      count: number(entry, "count"),
    })),
  }));
}

export async function reactionUsers(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<DiscordUser[]> {
  return users(await call("/discord/reactions", { channelId, messageId, emoji }));
}

export interface MessageLink {
  guildId: string;
  channelId: string;
  messageId: string;
}

export function parseMessageLink(link: string): MessageLink | null {
  const match = /channels\/(\d+)\/(\d+)\/(\d+)/.exec(link.trim());

  if (!match) return null;

  return { guildId: match[1]!, channelId: match[2]!, messageId: match[3]! };
}

function users(raw: unknown): DiscordUser[] {
  return list(raw).map((item) => ({
    id: string(item, "id"),
    username: string(item, "username"),
    displayName: string(item, "displayName"),
  }));
}

function named(raw: unknown): { id: string; name: string }[] {
  return list(raw).map((item) => ({ id: string(item, "id"), name: string(item, "name") }));
}

function list(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function string(source: unknown, key: string): string {
  if (typeof source !== "object" || source === null) return "";

  const value = Reflect.get(source, key);

  return typeof value === "string" ? value : "";
}

function number(source: unknown, key: string): number {
  if (typeof source !== "object" || source === null) return 0;

  const value = Reflect.get(source, key);

  return typeof value === "number" ? value : 0;
}
