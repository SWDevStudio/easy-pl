import { describe, expect, it } from "vitest";
import { notifyWrite, onWrite, withoutTracking } from "./writes";

function counter(): { count: () => number; stop: () => void } {
  let seen = 0;
  const stop = onWrite(() => {
    seen += 1;
  });

  return { count: () => seen, stop };
}

describe("отслеживание записей в базу", () => {
  it("считает изменяющие запросы", () => {
    const watcher = counter();

    notifyWrite("INSERT INTO players (family_name) VALUES (?)");
    notifyWrite("  update players set debt = 0");
    notifyWrite("DELETE FROM event_signups WHERE event_id = ?");

    expect(watcher.count()).toBe(3);
    watcher.stop();
  });

  it("не считает служебные таблицы — иначе обмен будит сам себя", () => {
    const watcher = counter();

    notifyWrite("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    notifyWrite("UPDATE settings SET value = ? WHERE key = 'sync.revision'");
    notifyWrite("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)");
    notifyWrite("INSERT INTO draw_log (event_id, seed) VALUES (?, ?)");

    expect(watcher.count()).toBe(0);
    watcher.stop();
  });

  it("не считает чтение", () => {
    const watcher = counter();

    notifyWrite("SELECT id FROM players");
    notifyWrite("  select count(*) from events");

    expect(watcher.count()).toBe(0);
    watcher.stop();
  });

  it("молчит, пока применяются чужие правки", async () => {
    const watcher = counter();

    await withoutTracking(async () => {
      notifyWrite("UPDATE players SET debt = 1 WHERE id = 1");
      notifyWrite("INSERT INTO events (title) VALUES ('Осада')");
    });

    expect(watcher.count()).toBe(0);

    notifyWrite("UPDATE players SET debt = 2 WHERE id = 1");

    expect(watcher.count()).toBe(1);
    watcher.stop();
  });

  it("снимает глушение даже когда применение упало", async () => {
    const watcher = counter();

    await expect(
      withoutTracking(async () => {
        throw new Error("обмен оборвался");
      }),
    ).rejects.toThrow("обмен оборвался");

    notifyWrite("UPDATE players SET debt = 3 WHERE id = 1");

    expect(watcher.count()).toBe(1);
    watcher.stop();
  });

  it("отписка перестаёт получать события", () => {
    const watcher = counter();

    notifyWrite("UPDATE players SET debt = 4 WHERE id = 1");
    watcher.stop();
    notifyWrite("UPDATE players SET debt = 5 WHERE id = 1");

    expect(watcher.count()).toBe(1);
  });
});
