import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CLASS_SEED } from "./seed/classes";
import { PLAYER_SEED } from "./seed/players";
import { MigrationError, MIGRATIONS, runMigrations, type SqlExecutor } from "./migrations";

function createExecutor(db: DatabaseSync): SqlExecutor {
  return {
    execute(query: string, bindValues: unknown[] = []) {
      db.prepare(query).run(...toBindings(bindValues));

      return Promise.resolve(undefined);
    },
    select(query: string, bindValues: unknown[] = []) {
      return Promise.resolve(db.prepare(query).all(...toBindings(bindValues)));
    },
  };
}

function toBindings(values: unknown[]): (string | number | null)[] {
  return values.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" || typeof value === "string") return value;
    if (typeof value === "boolean") return value ? 1 : 0;

    return String(value);
  });
}

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .flatMap((row) => {
      const name = Reflect.get(row, "name");

      return typeof name === "string" ? [name] : [];
    });
}

function countOf(db: DatabaseSync, table: string, where = ""): number {
  const filter = where ? ` WHERE ${where}` : "";
  const rows = db.prepare(`SELECT COUNT(*) AS count FROM "${table}"${filter}`).all();
  const count = rows[0] === undefined ? undefined : Reflect.get(rows[0], "count");

  return typeof count === "number" ? count : -1;
}

function insert(db: DatabaseSync, sql: string, params: (string | number | null)[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

function scalar(db: DatabaseSync, sql: string, params: (string | number)[] = []): unknown {
  const rows = db.prepare(sql).all(...params);

  return rows[0] === undefined ? undefined : Object.values(rows[0])[0];
}

const EXPECTED_TABLES = [
  "_migrations",
  "attendance",
  "classes",
  "draw_log",
  "event_quotas",
  "event_signups",
  "event_slots",
  "events",
  "players",
  "settings",
];

const SEEDED_CLASSES = CLASS_SEED.reduce((total, entry) => total + entry.paths.length, 0);

describe("runMigrations", () => {
  it("хранит миграции в порядке возрастания версии", () => {
    const versions = MIGRATIONS.map((migration) => migration.version);

    expect(versions).toEqual([...versions].sort((left, right) => left - right));
  });

  it("создаёт все таблицы на пустой базе", async () => {
    const db = new DatabaseSync(":memory:");

    await runMigrations(createExecutor(db));

    expect(tableNames(db)).toEqual(expect.arrayContaining(EXPECTED_TABLES));
    db.close();
  });

  it("засеивает справочник классов", async () => {
    const db = new DatabaseSync(":memory:");

    await runMigrations(createExecutor(db));

    expect(countOf(db, "classes")).toBe(SEEDED_CLASSES);
    db.close();
  });

  it("повторный запуск ничего не ломает и не дублирует", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);
    await runMigrations(executor);
    await runMigrations(executor);

    expect(countOf(db, "classes")).toBe(SEEDED_CLASSES);
    expect(countOf(db, "_migrations")).toBe(MIGRATIONS.length);
    db.close();
  });

  it("переживает потерю журнала миграций", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);
    db.prepare("DELETE FROM _migrations").run();

    await expect(runMigrations(executor)).resolves.toBeGreaterThan(0);
    expect(countOf(db, "classes")).toBe(SEEDED_CLASSES);
    db.close();
  });

  it("сохраняет данные при повторном прогоне", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);
    insert(db, "INSERT INTO players (family_name, joined_at, updated_at) VALUES (?, ?, ?)", [
      "Kalimdor",
      "2026-08-09",
      "2026-08-09",
    ]);
    db.prepare("DELETE FROM _migrations").run();

    await runMigrations(executor);

    expect(countOf(db, "players", "family_name = 'Kalimdor'")).toBe(1);
    db.close();
  });

  it("описывает каскадное удаление в схеме", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    await runMigrations(createExecutor(db));

    const eventId = insert(
      db,
      "INSERT INTO events (title, event_date, slots, updated_at) VALUES (?, ?, ?, ?)",
      ["Осада", "2026-08-09", 10, "2026-08-09"],
    );
    const playerId = insert(db, "INSERT INTO players (family_name, joined_at, updated_at) VALUES (?, ?, ?)", [
      "Kalimdor",
      "2026-08-09",
      "2026-08-09",
    ]);

    db.prepare("INSERT INTO event_signups (event_id, player_id) VALUES (?, ?)").run(eventId, playerId);
    db.prepare("DELETE FROM events WHERE id = ?").run(eventId);

    expect(countOf(db, "event_signups")).toBe(0);
    db.close();
  });

  it("добавляет колонки игрокам и справочник рейдов", async () => {
    const db = new DatabaseSync(":memory:");

    await runMigrations(createExecutor(db));

    const columns = db
      .prepare("SELECT name FROM pragma_table_info('players')")
      .all()
      .flatMap((row) => {
        const name = Reflect.get(row, "name");

        return typeof name === "string" ? [name] : [];
      });

    expect(columns).toEqual(
      expect.arrayContaining(["discord", "discord_id", "raid_id", "is_favorite"]),
    );
    expect(tableNames(db)).toEqual(expect.arrayContaining(["raids"]));
    db.close();
  });

  it("заводит у заявки разовый рейд", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    await runMigrations(createExecutor(db));

    const raidId = insert(db, "INSERT INTO raids (name, updated_at, uid) VALUES (?, ?, ?)", [
      "Альфа",
      "2026-01-01T00:00:00.000Z",
      "raid:Альфа",
    ]);
    const eventId = insert(
      db,
      "INSERT INTO events (title, event_date, slots, updated_at) VALUES (?, ?, ?, ?)",
      ["Осада", "2026-08-09", 1, "2026-08-09T00:00:00.000Z"],
    );
    const playerId = insert(db, "INSERT INTO players (family_name, joined_at, updated_at) VALUES (?, ?, ?)", [
      "Kalimdor",
      "2026-08-09",
      "2026-08-09T00:00:00.000Z",
    ]);

    db.prepare("INSERT INTO event_signups (event_id, player_id, raid_id) VALUES (?, ?, ?)").run(
      eventId,
      playerId,
      raidId,
    );

    expect(scalar(db, "SELECT raid_id FROM event_signups WHERE event_id = ?", [eventId])).toBe(raidId);
    expect(scalar(db, "SELECT raid_id FROM players WHERE id = ?", [playerId])).toBe(null);
    db.close();
  });

  it("засеивает состав гильдии без классов и без дублей", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);
    db.prepare("DELETE FROM _migrations").run();
    await runMigrations(executor);

    expect(countOf(db, "players")).toBe(PLAYER_SEED.length);
    expect(countOf(db, "players", "class_id IS NULL")).toBe(PLAYER_SEED.length);
    db.close();
  });

  it("выдаёт каждой записи уникальный идентификатор для синхронизации", async () => {
    const db = new DatabaseSync(":memory:");

    await runMigrations(createExecutor(db));

    for (const table of ["classes", "raids", "players", "events"]) {
      const rows = db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT uid) AS unique_uids FROM "${table}"`).all();
      const total = Reflect.get(rows[0] ?? {}, "total");
      const unique = Reflect.get(rows[0] ?? {}, "unique_uids");

      expect(unique).toBe(total);
    }

    const empty = countOf(db, "classes", "uid IS NULL OR uid = ''");

    expect(empty).toBe(0);
    expect(tableNames(db)).toEqual(expect.arrayContaining(["tombstones"]));
    db.close();
  });

  it("не перевыдаёт идентификаторы при повторном прогоне", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);

    const before = db.prepare("SELECT uid FROM classes ORDER BY id LIMIT 1").all()[0];

    db.prepare("DELETE FROM _migrations").run();
    await runMigrations(executor);

    const after = db.prepare("SELECT uid FROM classes ORDER BY id LIMIT 1").all()[0];

    expect(Reflect.get(after ?? {}, "uid")).toBe(Reflect.get(before ?? {}, "uid"));
    db.close();
  });

  it("не пытается повторно добавить существующие колонки", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);
    db.prepare("DELETE FROM _migrations").run();

    await expect(runMigrations(executor)).resolves.toBeGreaterThan(0);
    db.close();
  });

  it("раскладывает места разыгранной осады по рейдам", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);

    const raidId = insert(db, "INSERT INTO raids (name, updated_at, uid) VALUES (?, ?, ?)", [
      "Альфа",
      "2026-01-01T00:00:00.000Z",
      "raid:Альфа",
    ]);
    const eventId = insert(
      db,
      `INSERT INTO events (title, event_date, slots, status, share, updated_at, uid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["Осада", "2026-08-09", 5, "drawn", 0.25, "2026-08-09T20:00:00.000Z", "event-legacy"],
    );
    const inRaid = insert(
      db,
      "INSERT INTO players (family_name, joined_at, updated_at, raid_id) VALUES (?, ?, ?, ?)",
      ["Alpha", "2026-08-09", "2026-08-09", raidId],
    );
    const loner = insert(db, "INSERT INTO players (family_name, joined_at, updated_at) VALUES (?, ?, ?)", [
      "Loner",
      "2026-08-09",
      "2026-08-09",
    ]);

    for (const playerId of [inRaid, loner]) {
      db.prepare("INSERT INTO event_slots (event_id, player_id, source) VALUES (?, ?, 'lottery')").run(
        eventId,
        playerId,
      );
    }

    db.prepare("DELETE FROM event_quotas").run();
    db.prepare("DELETE FROM _migrations WHERE version = 13").run();

    await runMigrations(executor);

    expect(countOf(db, "event_quotas", `event_id = ${eventId}`)).toBe(2);
    expect(scalar(db, "SELECT slots FROM event_quotas WHERE event_id = ? AND raid_id = ?", [eventId, raidId])).toBe(1);
    expect(scalar(db, "SELECT slots FROM event_quotas WHERE event_id = ? AND raid_id = 0", [eventId])).toBe(1);
    expect(scalar(db, "SELECT share FROM event_quotas WHERE event_id = ? AND raid_id = 0", [eventId])).toBe(0.25);
    expect(scalar(db, "SELECT slots FROM events WHERE id = ?", [eventId])).toBe(2);
  });

  it("отдаёт места старого черновика группе без рейда", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);

    const eventId = insert(
      db,
      "INSERT INTO events (title, event_date, slots, updated_at, uid) VALUES (?, ?, ?, ?, ?)",
      ["Черновик", "2026-08-09", 7, "2026-08-09T20:00:00.000Z", "event-draft"],
    );

    db.prepare("DELETE FROM event_quotas").run();
    db.prepare("DELETE FROM _migrations WHERE version = 13").run();

    await runMigrations(executor);

    expect(scalar(db, "SELECT slots FROM event_quotas WHERE event_id = ? AND raid_id = 0", [eventId])).toBe(7);
    expect(scalar(db, "SELECT share FROM event_quotas WHERE event_id = ?", [eventId])).toBe(null);
    expect(scalar(db, "SELECT slots FROM events WHERE id = ?", [eventId])).toBe(7);
  });

  it("сообщает, на какой миграции и запросе упало", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    db.exec("CREATE TABLE classes (wrong_column INTEGER)");

    await expect(runMigrations(executor)).rejects.toThrow(MigrationError);
    db.close();
  });
});
