export interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
}

interface Change {
  entity: string;
  uid: string;
  updatedAt: string;
  deleted: boolean;
  data: unknown;
}

interface SyncRequest {
  since: number;
  changes: Change[];
}

const ENTITIES = new Set(["class", "raid", "player", "event", "setting"]);
const MAX_CHANGES = 2000;
const PULL_LIMIT = 5000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return text("Only POST is supported", 405);
    if (!authorized(request, env)) return json({ error: "Неверный токен синхронизации" }, 401);

    const url = new URL(request.url);

    if (url.pathname !== "/sync") return json({ error: "Неизвестный маршрут" }, 404);

    let payload: SyncRequest;

    try {
      payload = parse(await request.json());
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : "Некорректный запрос" }, 400);
    }

    try {
      const revision = payload.changes.length > 0 ? await nextRevision(env) : await currentRevision(env);

      if (payload.changes.length > 0) await push(env, payload.changes, revision);

      const changes = await pull(env, payload.since);

      return json({ revision, changes });
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : "Ошибка базы" }, 500);
    }
  },
};

function authorized(request: Request, env: Env): boolean {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (token.length === 0 || token.length !== env.SYNC_TOKEN.length) return false;

  let diff = 0;

  for (let index = 0; index < token.length; index += 1) {
    diff |= token.charCodeAt(index) ^ env.SYNC_TOKEN.charCodeAt(index);
  }

  return diff === 0;
}

function parse(body: unknown): SyncRequest {
  if (typeof body !== "object" || body === null) throw new Error("Ожидался объект");

  const since = Reflect.get(body, "since");
  const changes = Reflect.get(body, "changes");

  if (typeof since !== "number" || !Number.isFinite(since) || since < 0) {
    throw new Error("Поле since должно быть неотрицательным числом");
  }

  if (!Array.isArray(changes)) throw new Error("Поле changes должно быть массивом");
  if (changes.length > MAX_CHANGES) throw new Error(`Слишком много изменений за раз, максимум ${MAX_CHANGES}`);

  return { since, changes: changes.map(parseChange) };
}

function parseChange(raw: unknown): Change {
  if (typeof raw !== "object" || raw === null) throw new Error("Изменение должно быть объектом");

  const entity = Reflect.get(raw, "entity");
  const uid = Reflect.get(raw, "uid");
  const updatedAt = Reflect.get(raw, "updatedAt");
  const deleted = Reflect.get(raw, "deleted");

  if (typeof entity !== "string" || !ENTITIES.has(entity)) throw new Error(`Неизвестная сущность: ${entity}`);
  if (typeof uid !== "string" || uid.length === 0) throw new Error("Пустой uid");
  if (typeof updatedAt !== "string" || updatedAt.length === 0) throw new Error("Пустой updatedAt");

  return { entity, uid, updatedAt, deleted: deleted === true, data: Reflect.get(raw, "data") ?? null };
}

async function currentRevision(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT value FROM counter WHERE name = 'revision'`).first<{
    value: number;
  }>();

  return row?.value ?? 0;
}

async function nextRevision(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `UPDATE counter SET value = value + 1 WHERE name = 'revision' RETURNING value`,
  ).first<{ value: number }>();

  if (!row) throw new Error("Счётчик ревизий не инициализирован — примените schema.sql");

  return row.value;
}

async function push(env: Env, changes: Change[], revision: number): Promise<void> {
  const statements = changes.map((change) =>
    env.DB.prepare(
      `INSERT INTO records (entity, uid, revision, updated_at, deleted, data)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (entity, uid) DO UPDATE SET
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         deleted = excluded.deleted,
         data = excluded.data
       WHERE excluded.updated_at > records.updated_at`,
    ).bind(
      change.entity,
      change.uid,
      revision,
      change.updatedAt,
      change.deleted ? 1 : 0,
      change.data === null ? null : JSON.stringify(change.data),
    ),
  );

  await env.DB.batch(statements);
}

async function pull(env: Env, since: number): Promise<Change[]> {
  const result = await env.DB.prepare(
    `SELECT entity, uid, updated_at, deleted, data FROM records
     WHERE revision > ? ORDER BY revision LIMIT ?`,
  )
    .bind(since, PULL_LIMIT)
    .all<{ entity: string; uid: string; updated_at: string; deleted: number; data: string | null }>();

  return result.results.map((row) => ({
    entity: row.entity,
    uid: row.uid,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
    data: row.data === null ? null : JSON.parse(row.data),
  }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
