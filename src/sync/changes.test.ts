import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/db/client";
import { runMigrations } from "@/db/migrations";
import { applyChanges, collectChanges } from "./changes";
import type { Change } from "./types";

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

  it("переносит места по рейдам вместе с осадой", async () => {
    source.db
      .prepare("INSERT INTO raids (name, updated_at, uid) VALUES (?, ?, ?)")
      .run("Альфа", "2026-08-09T10:00:00Z", "raid-1");
    const raidId = Number(scalar(source.db, "SELECT id FROM raids WHERE uid = 'raid-1'"));

    source.db
      .prepare(
        `INSERT INTO events (title, event_date, slots, status, updated_at, uid) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("Осада", "2026-08-09", 5, "drawn", "2026-08-09T20:00:00Z", "event-1");
    const eventId = Number(scalar(source.db, "SELECT id FROM events WHERE uid = 'event-1'"));

    source.db
      .prepare("INSERT INTO event_quotas (event_id, raid_id, slots, share) VALUES (?, ?, ?, ?)")
      .run(eventId, raidId, 3, 0.5);
    source.db
      .prepare("INSERT INTO event_quotas (event_id, raid_id, slots, share) VALUES (?, 0, ?, ?)")
      .run(eventId, 2, 0.25);

    await applyChanges(target.sql, await collectChanges(source.sql, null));

    const targetEvent = Number(scalar(target.db, "SELECT id FROM events WHERE uid = 'event-1'"));
    const targetRaid = Number(scalar(target.db, "SELECT id FROM raids WHERE uid = 'raid-1'"));

    expect(
      scalar(target.db, "SELECT slots FROM event_quotas WHERE event_id = ? AND raid_id = ?", [
        targetEvent,
        targetRaid,
      ]),
    ).toBe(3);
    expect(
      scalar(target.db, "SELECT share FROM event_quotas WHERE event_id = ? AND raid_id = 0", [targetEvent]),
    ).toBe(0.25);
  });

  it("переносит разовый рейд заявки, не трогая рейд игрока", async () => {
    source.db
      .prepare("INSERT INTO raids (name, updated_at, uid) VALUES (?, ?, ?)")
      .run("Альфа", "2026-08-09T10:00:00Z", "raid-1");
    const raidId = Number(scalar(source.db, "SELECT id FROM raids WHERE uid = 'raid-1'"));

    source.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Гость", "2026-08-01", "2026-08-09T12:00:00Z", "player-1");
    const playerId = Number(scalar(source.db, "SELECT id FROM players WHERE uid = 'player-1'"));

    source.db
      .prepare(`INSERT INTO events (title, event_date, slots, status, updated_at, uid) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("Осада", "2026-08-09", 1, "draft", "2026-08-09T20:00:00Z", "event-1");
    const eventId = Number(scalar(source.db, "SELECT id FROM events WHERE uid = 'event-1'"));

    source.db
      .prepare("INSERT INTO event_signups (event_id, player_id, is_priority, raid_id) VALUES (?, ?, 1, ?)")
      .run(eventId, playerId, raidId);

    await applyChanges(target.sql, await collectChanges(source.sql, null));

    const targetEvent = Number(scalar(target.db, "SELECT id FROM events WHERE uid = 'event-1'"));
    const targetRaid = Number(scalar(target.db, "SELECT id FROM raids WHERE uid = 'raid-1'"));

    expect(scalar(target.db, "SELECT raid_id FROM event_signups WHERE event_id = ?", [targetEvent])).toBe(
      targetRaid,
    );
    expect(scalar(target.db, "SELECT raid_id FROM players WHERE uid = 'player-1'")).toBe(null);
  });

  it("откладывает осаду, пока не приехал разовый рейд заявки", async () => {
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Гость", "2026-08-01", "2026-08-09T12:00:00Z", "player-1");

    const result = await applyChanges(target.sql, [
      {
        entity: "event",
        uid: "event-1",
        updatedAt: "2026-08-09T21:00:00.000Z",
        deleted: false,
        revision: 9,
        data: {
          title: "Осада",
          eventDate: "2026-08-09",
          slots: 1,
          status: "draft",
          quotas: [],
          signups: [{ playerUid: "player-1", isPriority: true, raidUid: "raid-missing" }],
          roster: [],
          attendance: [],
        },
      },
    ]);

    expect(result.deferred).toBe(1);
    expect(result.cursor).toBeNull();
  });

  it("откладывает осаду, пока не приехал рейд, которому выделены места", async () => {
    const result = await applyChanges(target.sql, [
      {
        entity: "event",
        uid: "event-1",
        updatedAt: "2026-08-09T21:00:00.000Z",
        deleted: false,
        revision: 9,
        data: {
          title: "Осада",
          eventDate: "2026-08-09",
          slots: 3,
          status: "draft",
          quotas: [{ raidUid: "raid-missing", slots: 3, share: null }],
          signups: [],
          roster: [],
          attendance: [],
        },
      },
    ]);

    expect(result.deferred).toBe(1);
    expect(result.cursor).toBeNull();
  });

  it("раскладывает осаду от старого клиента в группу без рейда", async () => {
    await applyChanges(target.sql, [
      {
        entity: "event",
        uid: "event-1",
        updatedAt: "2026-08-09T21:00:00.000Z",
        deleted: false,
        revision: 9,
        data: {
          title: "Осада",
          eventDate: "2026-08-09",
          slots: 4,
          status: "draft",
          signups: [],
          roster: [],
          attendance: [],
        },
      },
    ]);

    const eventId = Number(scalar(target.db, "SELECT id FROM events WHERE uid = 'event-1'"));

    expect(
      scalar(target.db, "SELECT slots FROM event_quotas WHERE event_id = ? AND raid_id = 0", [eventId]),
    ).toBe(4);
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
    expect(applied.applied).toBe(0);
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

    expect(applied.applied).toBe(0);
    expect(scalar(target.db, "SELECT COUNT(*) FROM players WHERE uid = 'player-1'")).toBe(1);
  });

  it("не воскрешает удалённого игрока правкой, пришедшей позже, но сделанной раньше", async () => {
    target.db
      .prepare("INSERT INTO tombstones (entity, uid, deleted_at) VALUES ('player', 'player-1', ?)")
      .run("2026-08-09T10:00:00.000Z");

    const stale: Change[] = [
      {
        entity: "player",
        uid: "player-1",
        updatedAt: "2026-08-09T09:00:00.000Z",
        deleted: false,
        revision: 5,
        data: { familyName: "Воскресший", joinedAt: "2026-08-01", debt: 0 },
      },
    ];

    const result = await applyChanges(target.sql, stale);

    expect(scalar(target.db, "SELECT COUNT(*) FROM players WHERE uid = 'player-1'")).toBe(0);
    expect(result.applied).toBe(0);
  });

  it("удаление, пришедшее с чужой машины, оставляет надгробие", async () => {
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Ушедший", "2026-08-01", "2026-08-09T10:00:00.000Z", "player-1");

    await applyChanges(target.sql, [
      {
        entity: "player",
        uid: "player-1",
        updatedAt: "2026-08-09T22:00:00.000Z",
        deleted: true,
        revision: 7,
        data: null,
      },
    ]);

    expect(
      scalar(target.db, "SELECT deleted_at FROM tombstones WHERE entity = 'player' AND uid = 'player-1'"),
    ).toBe("2026-08-09T22:00:00.000Z");
  });

  it("проигравшая правка не забирает себе чужой uid", async () => {
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid, debt) VALUES (?, ?, ?, ?, ?)")
      .run("Kalimdor", "2026-08-01", "2026-08-09T20:00:00.000Z", "local-uid", 4);

    const result = await applyChanges(target.sql, [
      {
        entity: "player",
        uid: "remote-uid",
        updatedAt: "2026-08-09T10:00:00.000Z",
        deleted: false,
        revision: 3,
        data: { familyName: "Kalimdor", joinedAt: "2026-08-01", debt: 0 },
      },
    ]);

    expect(scalar(target.db, "SELECT uid FROM players WHERE family_name = 'Kalimdor'")).toBe("local-uid");
    expect(scalar(target.db, "SELECT debt FROM players WHERE family_name = 'Kalimdor'")).toBe(4);
    expect(result.applied).toBe(0);
  });

  it("после присвоения uid старый идентификатор всё ещё находит игрока", async () => {
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Kalimdor", "2026-08-01", "2026-08-09T10:00:00.000Z", "player:Kalimdor");

    await applyChanges(target.sql, [
      {
        entity: "player",
        uid: "remote-uid",
        updatedAt: "2026-08-09T20:00:00.000Z",
        deleted: false,
        revision: 4,
        data: { familyName: "Kalimdor", joinedAt: "2026-08-01", debt: 0 },
      },
      {
        entity: "event",
        uid: "event-1",
        updatedAt: "2026-08-09T21:00:00.000Z",
        deleted: false,
        revision: 5,
        data: {
          title: "Осада",
          eventDate: "2026-08-09",
          slots: 10,
          status: "drawn",
          signups: [{ playerUid: "player:Kalimdor", isPriority: true }],
          roster: [],
          attendance: [],
        },
      },
    ]);

    const eventId = Number(scalar(target.db, "SELECT id FROM events WHERE uid = 'event-1'"));

    expect(scalar(target.db, "SELECT uid FROM players WHERE family_name = 'Kalimdor'")).toBe("remote-uid");
    expect(scalar(target.db, "SELECT COUNT(*) FROM event_signups WHERE event_id = ?", [eventId])).toBe(1);
  });

  it("откладывает осаду, пока не приехал её участник", async () => {
    const bundle: Change[] = [
      {
        entity: "event",
        uid: "event-1",
        updatedAt: "2026-08-09T21:00:00.000Z",
        deleted: false,
        revision: 9,
        data: {
          title: "Осада",
          eventDate: "2026-08-09",
          slots: 10,
          status: "drawn",
          signups: [{ playerUid: "player-missing", isPriority: false }],
          roster: [],
          attendance: [],
        },
      },
    ];

    const result = await applyChanges(target.sql, bundle);

    expect(result.deferred).toBe(1);
    expect(result.cursor).toBeNull();
    expect(scalar(target.db, "SELECT updated_at FROM events WHERE uid = 'event-1'")).not.toBe(
      "2026-08-09T21:00:00.000Z",
    );
  });

  it("двигает курсор только до первой незакрытой правки", async () => {
    const changes: Change[] = [
      {
        entity: "player",
        uid: "player-1",
        updatedAt: "2026-08-09T10:00:00.000Z",
        deleted: false,
        revision: 10,
        data: { familyName: "Первый", joinedAt: "2026-08-01", debt: 0 },
      },
      {
        entity: "event",
        uid: "event-1",
        updatedAt: "2026-08-09T11:00:00.000Z",
        deleted: false,
        revision: 11,
        data: {
          title: "Осада",
          eventDate: "2026-08-09",
          slots: 10,
          status: "drawn",
          signups: [{ playerUid: "player-missing", isPriority: false }],
          roster: [],
          attendance: [],
        },
      },
      {
        entity: "player",
        uid: "player-2",
        updatedAt: "2026-08-09T12:00:00.000Z",
        deleted: false,
        revision: 12,
        data: { familyName: "Второй", joinedAt: "2026-08-01", debt: 0 },
      },
    ];

    const result = await applyChanges(target.sql, changes);

    expect(result.cursor).toBe(10);
    expect(result.deferred).toBe(1);
  });

  it("переименование в занятое имя не роняет весь обмен", async () => {
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Azeroth", "2026-08-01", "2026-08-09T10:00:00.000Z", "player-a");
    target.db
      .prepare("INSERT INTO players (family_name, joined_at, updated_at, uid) VALUES (?, ?, ?, ?)")
      .run("Kalimdor", "2026-08-01", "2026-08-09T10:00:00.000Z", "player-b");

    const result = await applyChanges(target.sql, [
      {
        entity: "player",
        uid: "player-b",
        updatedAt: "2026-08-09T20:00:00.000Z",
        deleted: false,
        revision: 15,
        data: { familyName: "Azeroth", joinedAt: "2026-08-01", debt: 0 },
      },
      {
        entity: "player",
        uid: "player-c",
        updatedAt: "2026-08-09T21:00:00.000Z",
        deleted: false,
        revision: 16,
        data: { familyName: "Новичок", joinedAt: "2026-08-01", debt: 0 },
      },
    ]);

    expect(result.failed).toBe(1);
    expect(result.cursor).toBeNull();
    expect(scalar(target.db, "SELECT COUNT(*) FROM players WHERE uid = 'player-c'")).toBe(1);
  });

  it("справочник классов на двух свежих установках не задваивается", async () => {
    const changes = await collectChanges(source.sql, null);
    const before = scalar(target.db, "SELECT COUNT(*) FROM classes");

    await applyChanges(target.sql, changes);

    expect(scalar(target.db, "SELECT COUNT(*) FROM classes")).toBe(before);
    expect(changes.filter((item) => item.entity === "class").every((item) => item.uid.startsWith("class:"))).toBe(
      true,
    );
  });

  it("сид получает одинаковую отметку времени на любой машине", async () => {
    expect(scalar(source.db, "SELECT updated_at FROM classes ORDER BY id LIMIT 1")).toBe(
      scalar(target.db, "SELECT updated_at FROM classes ORDER BY id LIMIT 1"),
    );
    expect(scalar(source.db, "SELECT updated_at FROM players ORDER BY id LIMIT 1")).toBe(
      scalar(target.db, "SELECT updated_at FROM players ORDER BY id LIMIT 1"),
    );
  });

  it("чинит справочник, доставшийся от промежуточной версии", async () => {
    source.db.prepare("UPDATE classes SET uid = lower(hex(randomblob(16))), updated_at = ''").run();
    source.db.prepare("INSERT INTO raids (name, uid, updated_at) VALUES ('СФ', 'случайный', '')").run();
    source.db.prepare("DELETE FROM _migrations WHERE version = 12").run();

    await runMigrations(source.sql);

    const bad = scalar(source.db, "SELECT COUNT(*) FROM classes WHERE updated_at = '' OR uid NOT LIKE 'class:%'");

    expect(bad).toBe(0);
    expect(scalar(source.db, "SELECT uid FROM raids WHERE name = 'СФ'")).toBe("raid:СФ");
  });

  it("одна битая отметка не валит весь обмен", async () => {
    source.db.prepare("UPDATE classes SET updated_at = '' WHERE id = 1").run();
    source.db.prepare("UPDATE raids SET updated_at = '2026-08-09' WHERE 1").run();

    const changes = await collectChanges(source.sql, null);
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

    expect(changes.length).toBeGreaterThan(0);
    expect(changes.filter((item) => !iso.test(item.updatedAt))).toEqual([]);
  });

  it("все отметки времени в выгрузке — полный ISO с Z", async () => {
    const changes = await collectChanges(source.sql, null);
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

    expect(changes.length).toBeGreaterThan(0);
    expect(changes.filter((item) => !iso.test(item.updatedAt))).toEqual([]);
  });
});
