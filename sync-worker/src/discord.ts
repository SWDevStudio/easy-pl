const API = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (https://github.com/SWDevStudio/easy-pl, 0.1.0)";
const INVITE_PERMISSIONS = "66560";
const MEMBER_PAGE = 1000;
const MEMBER_CAP = 5000;
const REACTION_PAGE = 100;
const REACTION_CAP = 2000;
const MAX_RETRIES = 2;
const MAX_WAIT_SECONDS = 5;

export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscordError";
  }
}

export interface DiscordUser {
  id: string;
  username: string;
  displayName: string;
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

export async function handleDiscord(path: string, body: unknown, token: string): Promise<unknown> {
  if (path === "/discord/bot") return bot(token);
  if (path === "/discord/guilds") return guilds(token);
  if (path === "/discord/channels") return channels(token, text(body, "guildId"));
  if (path === "/discord/members") return members(token, text(body, "guildId"));
  if (path === "/discord/messages") return messages(token, text(body, "channelId"), limitOf(body));
  if (path === "/discord/reactions") {
    return reactions(token, text(body, "channelId"), text(body, "messageId"), text(body, "emoji"));
  }

  throw new DiscordError("Неизвестный маршрут Discord", 404);
}

async function bot(token: string): Promise<{ id: string; username: string; inviteUrl: string }> {
  const app = await call(token, `/applications/@me`);
  const id = text(app, "id");

  return {
    id,
    username: optional(app, "name") ?? "бот",
    inviteUrl:
      `https://discord.com/oauth2/authorize?client_id=${id}` +
      `&scope=bot&permissions=${INVITE_PERMISSIONS}&integration_type=0`,
  };
}

async function guilds(token: string): Promise<{ id: string; name: string }[]> {
  const list = await call(token, `/users/@me/guilds?limit=200`);

  if (!Array.isArray(list)) return [];

  return list.map((raw) => ({ id: text(raw, "id"), name: optional(raw, "name") ?? "без названия" }));
}

async function channels(token: string, guildId: string): Promise<DiscordChannel[]> {
  const list = await call(token, `/guilds/${encodeURIComponent(guildId)}/channels`);

  if (!Array.isArray(list)) return [];

  return list
    .filter((raw) => {
      const kind = Reflect.get(Object(raw), "type");

      return kind === 0 || kind === 5;
    })
    .map((raw) => ({ id: text(raw, "id"), name: optional(raw, "name") ?? "без названия" }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

async function members(token: string, guildId: string): Promise<DiscordUser[]> {
  const collected: DiscordUser[] = [];
  let after = "0";

  while (collected.length < MEMBER_CAP) {
    const page = await call(
      token,
      `/guilds/${encodeURIComponent(guildId)}/members?limit=${MEMBER_PAGE}&after=${after}`,
    );

    if (!Array.isArray(page) || page.length === 0) break;

    for (const raw of page) {
      const user = Reflect.get(Object(raw), "user");

      collected.push(toUser(user, optional(raw, "nick")));
    }

    const last = page[page.length - 1];

    after = text(Reflect.get(Object(last), "user"), "id");

    if (page.length < MEMBER_PAGE) break;
  }

  return collected;
}

async function messages(token: string, channelId: string, limit: number): Promise<DiscordMessage[]> {
  const list = await call(token, `/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`);

  if (!Array.isArray(list)) return [];

  return list.map((raw) => {
    const author = Reflect.get(Object(raw), "author");
    const list = Reflect.get(Object(raw), "reactions");

    return {
      id: text(raw, "id"),
      author: optional(author, "global_name") ?? optional(author, "username") ?? "неизвестно",
      content: optional(raw, "content") ?? "",
      timestamp: optional(raw, "timestamp") ?? "",
      reactions: Array.isArray(list) ? list.map(toReaction) : [],
    };
  });
}

async function reactions(
  token: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<DiscordUser[]> {
  const encoded = encodeURIComponent(emoji.trim());
  const collected: DiscordUser[] = [];
  let after = "0";

  while (collected.length < REACTION_CAP) {
    const page = await call(
      token,
      `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}` +
        `/reactions/${encoded}?limit=${REACTION_PAGE}&after=${after}`,
    );

    if (!Array.isArray(page) || page.length === 0) break;

    for (const raw of page) collected.push(toUser(raw, null));

    after = text(page[page.length - 1], "id");

    if (page.length < REACTION_PAGE) break;
  }

  return collected;
}

async function call(token: string, path: string, attempt = 0): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bot ${token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (response.ok) return response.json();

  const status = response.status;

  if (status === 401 || status === 403 || status === 404) {
    throw new DiscordError(explain(status), status === 404 ? 404 : 502);
  }

  const wait = status === 429 ? await retryAfter(response) : status >= 500 ? 1 : null;

  if (wait === null) throw new DiscordError(explain(status), 502);
  if (attempt >= MAX_RETRIES || wait > MAX_WAIT_SECONDS) throw new DiscordError(explain(status), 429);

  await sleep(wait);

  return call(token, path, attempt + 1);
}

async function retryAfter(response: Response): Promise<number> {
  try {
    const body = await response.json();
    const value = Reflect.get(Object(body), "retry_after");

    if (typeof value === "number" && Number.isFinite(value)) return value;
  } catch {
    return headerWait(response);
  }

  return headerWait(response);
}

function headerWait(response: Response): number {
  const header = Number(response.headers.get("Retry-After") ?? "1");

  return Number.isFinite(header) ? header : 1;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.ceil(seconds * 1000)));
}

function explain(status: number): string {
  if (status === 401) return "Discord отклонил токен бота — проверьте DISCORD_TOKEN на сервере";
  if (status === 403) {
    return (
      "Discord отказал в доступе. Проверьте, что бот добавлен на сервер, в Developer Portal включены " +
      "Server Members Intent и Message Content Intent, и у бота есть доступ к каналу"
    );
  }
  if (status === 404) return "Discord не нашёл сервер, канал или сообщение";
  if (status === 429) return "Discord просит подождать: слишком много запросов, попробуйте через минуту";

  return `Discord вернул ошибку ${status}`;
}

function toUser(raw: unknown, nick: string | null): DiscordUser {
  const username = optional(raw, "username") ?? "неизвестно";

  return {
    id: text(raw, "id"),
    username,
    displayName: nick ?? optional(raw, "global_name") ?? username,
  };
}

function toReaction(raw: unknown): DiscordReaction {
  const emoji = Reflect.get(Object(raw), "emoji");
  const count = Reflect.get(Object(raw), "count");
  const name = optional(emoji, "name") ?? "?";
  const id = optional(emoji, "id");

  return {
    key: id === null ? name : `${name}:${id}`,
    label: id === null ? name : `:${name}:`,
    count: typeof count === "number" ? count : 0,
  };
}

function text(source: unknown, key: string): string {
  const value = optional(source, key);

  if (value === null) throw new DiscordError(`Discord вернул ответ без поля ${key}`, 502);

  return value;
}

function optional(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;

  const value = Reflect.get(source, key);

  return typeof value === "string" ? value : null;
}

function limitOf(body: unknown): number {
  if (typeof body !== "object" || body === null) return 10;

  const value = Reflect.get(body, "limit");

  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 1), 50) : 10;
}
