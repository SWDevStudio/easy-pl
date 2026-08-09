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

function insert(db: DatabaseSync, sql: string, params: (string | number)[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

const EXPECTED_TABLES = [
  "_migrations",
  "attendance",
  "classes",
  "draw_log",
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

  it("не пытается повторно добавить существующие колонки", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    await runMigrations(executor);
    db.prepare("DELETE FROM _migrations").run();

    await expect(runMigrations(executor)).resolves.toBeGreaterThan(0);
    db.close();
  });

  it("сообщает, на какой миграции и запросе упало", async () => {
    const db = new DatabaseSync(":memory:");
    const executor = createExecutor(db);

    db.exec("CREATE TABLE classes (wrong_column INTEGER)");

    await expect(runMigrations(executor)).rejects.toThrow(MigrationError);
    db.close();
  });
});
