import { invoke } from "@tauri-apps/api/core";
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

export async function exchange(url: string, since: number, changes: Change[]): Promise<SyncResponse> {
  const raw: string = await invoke("sync_request", {
    url,
    payload: JSON.stringify({ since, changes }),
  });

  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) throw new Error("Сервер вернул неожиданный ответ");

  const error = Reflect.get(parsed, "error");

  if (typeof error === "string") throw new Error(error);

  const revision = Reflect.get(parsed, "revision");
  const incoming = Reflect.get(parsed, "changes");

  if (typeof revision !== "number") throw new Error("В ответе нет номера ревизии");

  return {
    revision,
    hasMore: Reflect.get(parsed, "hasMore") === true,
    changes: Array.isArray(incoming) ? incoming.filter(isChange) : [],
  };
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
