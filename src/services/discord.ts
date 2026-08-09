import { invoke } from "@tauri-apps/api/core";

export interface DiscordUser {
  id: string;
  username: string;
  displayName: string;
}

export function saveToken(token: string): Promise<void> {
  return invoke("discord_save_token", { token });
}

export function clearToken(): Promise<void> {
  return invoke("discord_clear_token");
}

export function hasToken(): Promise<boolean> {
  return invoke("discord_has_token");
}

export function checkGuild(guildId: string): Promise<string> {
  return invoke("discord_check", { guildId });
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

export function listMembers(guildId: string): Promise<DiscordUser[]> {
  return invoke("discord_list_members", { guildId });
}

export function listChannels(guildId: string): Promise<DiscordChannel[]> {
  return invoke("discord_list_channels", { guildId });
}

export function listMessages(channelId: string, limit = 10): Promise<DiscordMessage[]> {
  return invoke("discord_list_messages", { channelId, limit });
}

export function reactionUsers(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<DiscordUser[]> {
  return invoke("discord_reaction_users", { channelId, messageId, emoji });
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
