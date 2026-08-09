import { invoke } from "@tauri-apps/api/core";
import { readSyncSettings } from "@/sync/settings";
import type { Change, SyncResponse } from "@/sync/types";

export function saveToken(token: string): Promise<void> {
  return invoke("sync_save_token", { token });
}

export function clearToken(): Promise<void> {
  return invoke("sync_clear_token");
}

export function hasToken(): Promise<boolean> {
  return invoke("sync_has_token");
}

export function getToken(): Promise<string> {
  return invoke("sync_get_token");
}

export async function call(path: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const { url } = await readSyncSettings();

  if (!url) throw new Error("Синхронизация не настроена — подключите общую базу в настройках");

  return request(url, path, payload);
}

export async function exchange(url: string, since: number, changes: Change[]): Promise<SyncResponse> {
  const parsed = await request(url, "/sync", { since, changes });
  const revision = Reflect.get(Object(parsed), "revision");
  const incoming = Reflect.get(Object(parsed), "changes");

  if (typeof revision !== "number") throw new Error("В ответе нет номера ревизии");

  return {
    revision,
    hasMore: Reflect.get(Object(parsed), "hasMore") === true,
    changes: Array.isArray(incoming) ? incoming.filter(isChange) : [],
  };
}

async function request(url: string, path: string, payload: unknown): Promise<unknown> {
  const raw: string = await invoke("sync_request", { url, path, payload: JSON.stringify(payload) });
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) throw new Error("Сервер вернул неожиданный ответ");

  const error = Reflect.get(parsed, "error");

  if (typeof error === "string") throw new Error(error);

  return parsed;
}

function isChange(value: unknown): value is Change {
  if (typeof value !== "object" || value === null) return false;

  const entity = Reflect.get(value, "entity");
  const uid = Reflect.get(value, "uid");
  const updatedAt = Reflect.get(value, "updatedAt");
  const data = Reflect.get(value, "data");
  const deleted = Reflect.get(value, "deleted");

  if (typeof uid !== "string" || uid.length === 0) return false;
  if (typeof updatedAt !== "string" || updatedAt.length === 0) return false;
  if (typeof deleted !== "boolean") return false;
  if (data !== null && (typeof data !== "object" || Array.isArray(data))) return false;

  return entity === "class" || entity === "raid" || entity === "player" || entity === "event";
}
