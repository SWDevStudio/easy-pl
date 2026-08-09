CREATE TABLE IF NOT EXISTS records (
  entity     TEXT    NOT NULL,
  uid        TEXT    NOT NULL,
  revision   INTEGER NOT NULL,
  updated_at TEXT    NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  data       TEXT,
  PRIMARY KEY (entity, uid)
);

CREATE INDEX IF NOT EXISTS idx_records_revision ON records (revision);

CREATE TABLE IF NOT EXISTS counter (
  name  TEXT    PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT OR IGNORE INTO counter (name, value) VALUES ('revision', 0);
