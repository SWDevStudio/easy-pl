export type SyncEntity = "class" | "raid" | "player" | "event";

export const APPLY_ORDER: SyncEntity[] = ["class", "raid", "player", "event"];

export interface Change {
  entity: SyncEntity;
  uid: string;
  updatedAt: string;
  deleted: boolean;
  data: Record<string, unknown> | null;
  revision?: number;
}

export interface SyncResponse {
  revision: number;
  hasMore: boolean;
  changes: Change[];
}

export interface ApplyResult {
  applied: number;
  failed: number;
  deferred: number;
  cursor: number | null;
}

export interface SyncReport {
  sent: number;
  received: number;
  failed: number;
  deferred: number;
  revision: number;
}

export function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;

  const value = Reflect.get(source, key);

  return typeof value === "string" ? value : null;
}

export function readNumber(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) return null;

  const value = Reflect.get(source, key);

  return typeof value === "number" ? value : null;
}

export function readBoolean(source: unknown, key: string): boolean {
  if (typeof source !== "object" || source === null) return false;

  return Reflect.get(source, key) === true;
}

export function hasField(source: unknown, key: string): boolean {
  return typeof source === "object" && source !== null && Reflect.has(source, key);
}

export function readArray(source: unknown, key: string): unknown[] {
  if (typeof source !== "object" || source === null) return [];

  const value = Reflect.get(source, key);

  return Array.isArray(value) ? value : [];
}
