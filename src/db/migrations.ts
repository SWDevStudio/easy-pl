import { CLASS_SEED } from "./seed/classes";
import { PLAYER_SEED, ROSTER_DATE } from "./seed/players";

export interface SqlExecutor {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select(query: string, bindValues?: unknown[]): Promise<unknown[]>;
}

export interface MigrationStatement {
  sql: string;
  params?: unknown[];
  skipWhen?: { sql: string; params?: unknown[] };
}

export interface Migration {
  version: number;
  name: string;
  statements: MigrationStatement[];
}

export class MigrationError extends Error {
  constructor(
    readonly migration: Migration,
    readonly statement: MigrationStatement,
    readonly cause: unknown,
  ) {
    super(`Миграция ${migration.version} (${migration.name}) упала на запросе: ${statement.sql}`);
    this.name = "MigrationError";
  }
}

export const LEGACY_STAMP = "2026-01-01T00:00:00.000Z";

const SCHEMA: MigrationStatement[] = [
  {
    sql: `CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS classes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      base_name    TEXT NOT NULL,
      path         TEXT NOT NULL CHECK (path IN ('succession', 'awakening', 'liberation', 'none')),
      display_name TEXT NOT NULL,
      is_active    INTEGER NOT NULL DEFAULT 1,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      UNIQUE (base_name, path)
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS players (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      family_name TEXT NOT NULL UNIQUE,
      class_id    INTEGER REFERENCES classes (id),
      joined_at   TEXT NOT NULL,
      debt        REAL NOT NULL DEFAULT 0,
      benched     INTEGER NOT NULL DEFAULT 0,
      note        TEXT,
      updated_at  TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      event_date   TEXT NOT NULL,
      slots        INTEGER NOT NULL CHECK (slots >= 0),
      reserve_size INTEGER NOT NULL DEFAULT 0 CHECK (reserve_size >= 0),
      seed         TEXT,
      share        REAL,
      status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'drawn', 'closed')),
      updated_at   TEXT NOT NULL
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date)` },
  {
    sql: `CREATE TABLE IF NOT EXISTS event_signups (
      event_id    INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
      player_id   INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
      is_priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (event_id, player_id)
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS event_slots (
      event_id     INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
      player_id    INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
      source       TEXT NOT NULL CHECK (source IN ('priority', 'lottery', 'fallback', 'manual')),
      reserve_rank INTEGER,
      PRIMARY KEY (event_id, player_id)
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS attendance (
      event_id  INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
      showed_up INTEGER NOT NULL,
      marked_at TEXT NOT NULL,
      PRIMARY KEY (event_id, player_id)
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS draw_log (
      event_id      INTEGER PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
      seed          TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at    TEXT NOT NULL
    )`,
  },
];

const PATH_LABEL: Record<string, string> = {
  succession: "Традиция",
  awakening: "Пробуждение",
  liberation: "Освобождение",
};

function seedClasses(): MigrationStatement[] {
  return CLASS_SEED.flatMap((entry, index) =>
    entry.paths.map((path, pathIndex) => ({
      sql: `INSERT OR IGNORE INTO classes (base_name, path, display_name, sort_order) VALUES (?, ?, ?, ?)`,
      params: [
        entry.baseName,
        path,
        path === "none" ? entry.baseName : `${entry.baseName} (${PATH_LABEL[path]})`,
        index * 10 + pathIndex,
      ],
    })),
  );
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: "initial-schema", statements: SCHEMA },
  { version: 2, name: "seed-classes", statements: seedClasses() },
  {
    version: 3,
    name: "player-discord",
    statements: [
      {
        sql: `ALTER TABLE players ADD COLUMN discord TEXT`,
        skipWhen: { sql: `SELECT 1 FROM pragma_table_info('players') WHERE name = 'discord'` },
      },
    ],
  },
  {
    version: 4,
    name: "raids",
    statements: [
      {
        sql: `CREATE TABLE IF NOT EXISTS raids (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL UNIQUE,
          is_active  INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0
        )`,
      },
      {
        sql: `ALTER TABLE players ADD COLUMN raid_id INTEGER REFERENCES raids (id)`,
        skipWhen: { sql: `SELECT 1 FROM pragma_table_info('players') WHERE name = 'raid_id'` },
      },
    ],
  },
  {
    version: 5,
    name: "seed-roster",
    statements: PLAYER_SEED.map((familyName) => ({
      sql: `INSERT OR IGNORE INTO players (family_name, joined_at, updated_at) VALUES (?, ?, ?)`,
      params: [familyName, ROSTER_DATE, ROSTER_DATE],
    })),
  },
  {
    version: 6,
    name: "player-discord-id",
    statements: [
      {
        sql: `ALTER TABLE players ADD COLUMN discord_id TEXT`,
        skipWhen: { sql: `SELECT 1 FROM pragma_table_info('players') WHERE name = 'discord_id'` },
      },
    ],
  },
  {
    version: 7,
    name: "player-favorite",
    statements: [
      {
        sql: `ALTER TABLE players ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`,
        skipWhen: { sql: `SELECT 1 FROM pragma_table_info('players') WHERE name = 'is_favorite'` },
      },
    ],
  },
  {
    version: 8,
    name: "drop-benched",
    statements: [
      {
        sql: `ALTER TABLE players DROP COLUMN benched`,
        skipWhen: {
          sql: `SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('players') WHERE name = 'benched')`,
        },
      },
    ],
  },
  {
    version: 9,
    name: "player-lookup-indexes",
    statements: [
      { sql: `CREATE INDEX IF NOT EXISTS idx_signups_player ON event_signups (player_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_slots_player ON event_slots (player_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_attendance_player ON attendance (player_id)` },
    ],
  },
  {
    version: 10,
    name: "sync-identity",
    statements: [
      ...syncColumns("classes"),
      ...syncColumns("raids"),
      ...syncColumns("players"),
      ...syncColumns("events"),
      {
        sql: `CREATE TABLE IF NOT EXISTS tombstones (
          entity     TEXT NOT NULL,
          uid        TEXT NOT NULL,
          deleted_at TEXT NOT NULL,
          PRIMARY KEY (entity, uid)
        )`,
      },
    ],
  },
  {
    version: 11,
    name: "sync-hardening",
    statements: [
      { sql: `UPDATE classes SET updated_at = ? WHERE uid LIKE 'class:%'`, params: [LEGACY_STAMP] },
      { sql: `UPDATE raids SET updated_at = ? WHERE uid LIKE 'raid:%'`, params: [LEGACY_STAMP] },
      {
        sql: `UPDATE players SET updated_at = ? WHERE updated_at = ?`,
        params: [`${ROSTER_DATE}T00:00:00.000Z`, ROSTER_DATE],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS uid_aliases (
          entity  TEXT NOT NULL,
          old_uid TEXT NOT NULL,
          new_uid TEXT NOT NULL,
          PRIMARY KEY (entity, old_uid)
        )`,
      },
    ],
  },
  {
    version: 12,
    name: "stamp-repair",
    statements: [
      {
        sql: `UPDATE classes SET uid = ${naturalUid("classes")}
              WHERE uid IS NULL OR uid = '' OR uid NOT LIKE 'class:%'`,
      },
      {
        sql: `UPDATE raids SET uid = ${naturalUid("raids")}
              WHERE uid IS NULL OR uid = '' OR uid NOT LIKE 'raid:%'`,
      },
      ...["classes", "raids", "players", "events"].map((table) => ({
        sql: `UPDATE ${table} SET updated_at = ? WHERE updated_at IS NULL OR updated_at = ''`,
        params: [LEGACY_STAMP],
      })),
    ],
  },
  {
    version: 13,
    name: "event-raid-quotas",
    statements: [
      {
        sql: `CREATE TABLE IF NOT EXISTS event_quotas (
          event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
          raid_id  INTEGER NOT NULL DEFAULT 0,
          slots    INTEGER NOT NULL DEFAULT 0 CHECK (slots >= 0),
          share    REAL,
          PRIMARY KEY (event_id, raid_id)
        )`,
      },
      {
        sql: `INSERT OR IGNORE INTO event_quotas (event_id, raid_id, slots)
              SELECT t.event_id, COALESCE(p.raid_id, 0), COUNT(*)
              FROM event_slots t JOIN players p ON p.id = t.player_id
              WHERE t.reserve_rank IS NULL
              GROUP BY t.event_id, COALESCE(p.raid_id, 0)`,
      },
      {
        sql: `INSERT OR IGNORE INTO event_quotas (event_id, raid_id, slots)
              SELECT e.id, 0, e.slots FROM events e
              WHERE e.slots > 0
                AND NOT EXISTS (SELECT 1 FROM event_quotas q WHERE q.event_id = e.id)`,
      },
      {
        sql: `UPDATE event_quotas
              SET share = (SELECT e.share FROM events e WHERE e.id = event_quotas.event_id)
              WHERE share IS NULL`,
      },
      {
        sql: `UPDATE events
              SET slots = (SELECT COALESCE(SUM(q.slots), 0) FROM event_quotas q WHERE q.event_id = events.id)`,
      },
    ],
  },
  {
    version: 14,
    name: "signup-raid",
    statements: [
      {
        sql: `ALTER TABLE event_signups ADD COLUMN raid_id INTEGER REFERENCES raids (id)`,
        skipWhen: {
          sql: `SELECT 1 FROM pragma_table_info('event_signups') WHERE name = 'raid_id'`,
        },
      },
    ],
  },
];

function naturalUid(table: string): string {
  if (table === "classes") return `'class:' || base_name || ':' || path`;
  if (table === "raids") return `'raid:' || name`;
  if (table === "players") return `'player:' || family_name`;

  return `lower(hex(randomblob(16)))`;
}

function syncColumns(table: string): MigrationStatement[] {
  const statements: MigrationStatement[] = [
    {
      sql: `ALTER TABLE ${table} ADD COLUMN uid TEXT`,
      skipWhen: { sql: `SELECT 1 FROM pragma_table_info('${table}') WHERE name = 'uid'` },
    },
    {
      sql: `UPDATE ${table} SET uid = ${naturalUid(table)} WHERE uid IS NULL OR uid = ''`,
    },
    { sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uid ON ${table} (uid)` },
  ];

  if (table === "classes" || table === "raids") {
    statements.splice(
      1,
      0,
      {
        sql: `ALTER TABLE ${table} ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
        skipWhen: { sql: `SELECT 1 FROM pragma_table_info('${table}') WHERE name = 'updated_at'` },
      },
      {
        sql: `UPDATE ${table} SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE updated_at = ''`,
      },
    );
  }

  return statements;
}

export async function runMigrations(db: SqlExecutor): Promise<number> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = await db.select(`SELECT version FROM _migrations`);
  const done = new Set(versionsOf(applied));

  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;

    for (const statement of migration.statements) {
      try {
        if (await shouldSkip(db, statement)) continue;

        await db.execute(statement.sql, statement.params);
      } catch (error) {
        throw new MigrationError(migration, statement, error);
      }
    }

    await db.execute(
      `INSERT OR IGNORE INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)`,
      [migration.version, migration.name, new Date().toISOString()],
    );
  }

  return MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
}

async function shouldSkip(db: SqlExecutor, statement: MigrationStatement): Promise<boolean> {
  if (!statement.skipWhen) return false;

  const rows = await db.select(statement.skipWhen.sql, statement.skipWhen.params);

  return rows.length > 0;
}

function versionsOf(rows: unknown[]): number[] {
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];

    const version = Reflect.get(row, "version");

    return typeof version === "number" ? [version] : [];
  });
}
