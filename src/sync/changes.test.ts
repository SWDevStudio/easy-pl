import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/db/client";
import { runMigrations } from "@/db/migrations";
import { applyChanges, collectChanges } from "./changes";

function bind(values: unknown[]): (string | number | null)[] {
  return values.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" || typeof value === "string") return value;
    if (typeof value === "boolean") return value ? 1 : 0;

    return String(value);
  });
}

function bridgeRows<T>(rows: unknown): T;
function bridgeRows(rows: unknown): unknown {
  return rows;
}

function adapter(target: DatabaseSync): Sql {
  return {
    execute(query: string, values: unknown[] = []) {
      target.prepare(query).run(...bind(values));

      return Promise.resolve(undefined);
    },
    select<T>(query: string, values: unknown[] = []): Promise<T> {
      return Promise.resolve(bridgeRows<T>(target.prepare(query).all(...bind(values))));
    },
  };
}

async function freshDb(): Promise<{ db: DatabaseSync; sql: Sql }> {
  const db = new DatabaseSync(":memory:");
  const sql = adapter(db);

  await runMigrations(sql);

  return { db, sql };
}

function scalar(db: DatabaseSync, query: string, values: (string | number)[] = []): unknown {
  const rows = db.prepare(query).all(...values);

  return rows[0] === undefined ? undefined : Object.values(rows[0])[0];
}

let source: { db: DatabaseSync; sql: Sql };
let target: { db: DatabaseSync; sql: Sql };

beforeEach(async () => {
  source = await freshDb();
  target = await freshDb();
});

describe("синхронизация изменений", () => {
  it("переносит игрока со ссылками на класс и рейд", async () => {
    source.db.prepare("INSERT INTO raids (name, updated_at, uid) VALUES (?, ?, ?)").run("Основной", "2026-08-09T10:00:00Z", "raid-1");
    const raidId = scalar(source.db, "SELECT id FROM raids WHERE uid = 'raid-1'");
    const classId = scalar(source.db, "SELECT id FROM classes ORDER BY id LIMIT 1");
    const classUid = scalar(source.db, "SELECT uid FROM classes ORDER BY id LIMIT 1");

    source.db
      .prepare(
        `INSERT INTO players (family_name, class_id, raid_id, joined_at, updated_at, uid, debt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("Kalimdor", Number(classId), Number(raidId), "2026-08-01", "2026-08-09T12:00:00Z", "player-1", 2.5);

    const changes = await collectChanges(source.sql, null);

    await applyChanges(target.sql, changes);

    expect(scalar(target.db, "SELECT family_name FROM players WHERE uid = 'player-1'")).toBe("Kalimdor");
    expect(scalar(target.db, "SELECT debt FROM players WHERE uid = 'player-1'")).toBe(2.5);
    expect(
      scalar(target.db, "SELECT r.uid FROM players p JOIN raids r ON r.id = p.raid_id WHERE p.uid = 'player-1'"),
    ).toBe("raid-1");
    expect(
      scalar(target.db, "SELECT c.uid FROM players p JOIN classes c ON c.id = p.class_id WHERE p.uid = 'player-1'"),
    ).toBe(classUid);
  });

  it("переносит осаду вместе с заявками, составом и отметками", async () => {
    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Проверочный", "2026-08-01", "2026-08-09T12:00:00Z", "player-1");
    const playerId = Number(scalar(source.db, "SELECT id FROM players WHERE uid = 'player-1'"));

    source.db
      .prepare(
        `INSERT INTO events (title, event_date, slots, status, updated_at, uid) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("Осада", "2026-08-09", 10, "closed", "2026-08-09T20:00:00Z", "event-1");
    const eventId = Number(scalar(source.db, "SELECT id FROM events WHERE uid = 'event-1'"));

    source.db.prepare("INSERT INTO event_signups (event_id, player_id, is_priority) VALUES (?, ?, 1)").run(eventId, playerId);
    source.db.prepare("INSERT INTO event_slots (event_id, player_id, source) VALUES (?, ?, 'priority')").run(eventId, playerId);
    source.db
      .prepare("INSERT INTO attendance (event_id, player_id, showed_up, marked_at) VALUES (?, ?, 1, ?)")
      .run(eventId, playerId, "2026-08-09T21:00:00Z");

    await applyChanges(target.sql, await collectChanges(source.sql, null));

    const targetEvent = Number(scalar(target.db, "SELECT id FROM events WHERE uid = 'event-1'"));

    expect(scalar(target.db, "SELECT status FROM events WHERE uid = 'event-1'")).toBe("closed");
    expect(scalar(target.db, "SELECT is_priority FROM event_signups WHERE event_id = ?", [targetEvent])).toBe(1);
    expect(scalar(target.db, "SELECT source FROM event_slots WHERE event_id = ?", [targetEvent])).toBe("priority");
    expect(scalar(target.db, "SELECT showed_up FROM attendance WHERE event_id = ?", [targetEvent])).toBe(1);
  });

  it("не затирает более свежую запись старой", async () => {
    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid, debt) VALUES (?, ?, ?, ?, ?)")
      .run("Старая", "2026-08-01", "2026-08-09T10:00:00Z", "player-1", 1);
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid, debt) VALUES (?, ?, ?, ?, ?)")
      .run("Новая", "2026-08-01", "2026-08-09T20:00:00Z", "player-1", 5);

    const applied = await applyChanges(target.sql, await collectChanges(source.sql, null));

    expect(scalar(target.db, "SELECT family_name FROM players WHERE uid = 'player-1'")).toBe("Новая");
    expect(applied).toBe(0);
  });

  it("применяет более свежую запись поверх старой", async () => {
    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid, debt) VALUES (?, ?, ?, ?, ?)")
      .run("Новая", "2026-08-01", "2026-08-09T20:00:00Z", "player-1", 7);
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid, debt) VALUES (?, ?, ?, ?, ?)")
      .run("Старая", "2026-08-01", "2026-08-09T10:00:00Z", "player-1", 1);

    await applyChanges(target.sql, await collectChanges(source.sql, null));

    expect(scalar(target.db, "SELECT family_name FROM players WHERE uid = 'player-1'")).toBe("Новая");
    expect(scalar(target.db, "SELECT debt FROM players WHERE uid = 'player-1'")).toBe(7);
  });

  it("удаляет запись по надгробию", async () => {
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Ушедший", "2026-08-01", "2026-08-09T10:00:00Z", "player-1");
    source.db
      .prepare("INSERT INTO tombstones (entity, uid, deleted_at) VALUES ('player', 'player-1', ?)")
      .run("2026-08-09T22:00:00Z");

    await applyChanges(target.sql, await collectChanges(source.sql, null));

    expect(scalar(target.db, "SELECT COUNT(*) FROM players WHERE uid = 'player-1'")).toBe(0);
  });

  it("отдаёт только изменения после отметки времени", async () => {
    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Старый", "2026-08-01", "2026-08-01T10:00:00Z", "player-old");
    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Свежий", "2026-08-01", "2026-08-09T10:00:00Z", "player-new");

    const changes = await collectChanges(source.sql, "2026-08-05T00:00:00Z");
    const uids = changes.filter((item) => item.entity === "player").map((item) => item.uid);

    expect(uids).toContain("player-new");
    expect(uids).not.toContain("player-old");
  });

  it("переносит всё при повторной полной выгрузке без потерь", async () => {
    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Kalimdor", "2026-08-01", "2026-08-09T12:00:00Z", "player-1");

    const changes = await collectChanges(source.sql, null);

    await applyChanges(target.sql, changes);
    const applied = await applyChanges(target.sql, changes);

    expect(applied).toBe(0);
    expect(scalar(target.db, "SELECT COUNT(*) FROM players WHERE uid = 'player-1'")).toBe(1);
  });
});
