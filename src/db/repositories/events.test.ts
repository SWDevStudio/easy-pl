import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSql, type Sql } from "../client";
import { runMigrations } from "../migrations";
import { EventStateError } from "../types";
import {
  addToRoster,
  closeEvent,
  countOccupiedSeats,
  createEvent,
  listParticipants,
  runDraw,
  setAttendance,
  setPriority,
  setSignup,
} from "./events";

let db: DatabaseSync;

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

function createAdapter(target: DatabaseSync): Sql {
  return {
    execute(query: string, bindValues: unknown[] = []) {
      target.prepare(query).run(...bind(bindValues));

      return Promise.resolve(undefined);
    },
    select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
      return Promise.resolve(bridgeRows<T>(target.prepare(query).all(...bind(bindValues))));
    },
  };
}

async function addPlayer(name: string, debt = 0, favorite = false): Promise<number> {
  const info = db
    .prepare(
      `INSERT INTO players (family_name, joined_at, updated_at, debt, is_favorite)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(name, "2026-08-09", "2026-08-09", debt, favorite ? 1 : 0);

  return Number(info.lastInsertRowid);
}

function debtOf(playerId: number): number {
  const rows = db.prepare("SELECT debt FROM players WHERE id = ?").all(playerId);
  const debt = rows[0] === undefined ? undefined : Reflect.get(rows[0], "debt");

  return typeof debt === "number" ? debt : Number.NaN;
}

function sourceOf(participants: { playerId: number; slotSource: string | null }[], playerId: number) {
  return participants.find((item) => item.playerId === playerId)?.slotSource ?? null;
}

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  const adapter = createAdapter(db);

  await runMigrations(adapter);
  db.prepare("DELETE FROM players").run();
  useSql(adapter);
});

afterEach(() => {
  useSql(null);
  db.close();
});

describe("проведение осады", () => {
  it("раздаёт слоты приоритетным и остальным по жребию", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 2 });
    const ids = await Promise.all([addPlayer("A"), addPlayer("B"), addPlayer("C"), addPlayer("D")]);

    for (const id of ids) await setSignup(eventId, id, true);
    await setPriority(eventId, ids[0]!, true);

    await runDraw(eventId);

    const participants = await listParticipants(eventId);
    const main = participants.filter((item) => item.slotSource !== null);

    expect(main).toHaveLength(2);
    expect(main.find((item) => item.playerId === ids[0])?.slotSource).toBe("priority");
  });

  it("отдаёт место не пришедшего любому заявившемуся", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const chosen = await addPlayer("Chosen");
    const spare = await addPlayer("Spare");

    await setSignup(eventId, chosen, true);
    await setSignup(eventId, spare, true);
    await setPriority(eventId, chosen, true);

    await runDraw(eventId);
    await setAttendance(eventId, chosen, false);
    await addToRoster(eventId, spare);
    await setAttendance(eventId, spare, true);

    const participants = await listParticipants(eventId);

    expect(participants.find((item) => item.playerId === spare)?.slotSource).toBe("manual");
    expect(participants.filter((item) => item.slotSource !== null)).toHaveLength(2);
  });

  it("делает избранного игрока приоритетным сразу при заявке", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 2 });
    const favorite = await addPlayer("Favorite", 0, true);
    const regular = await addPlayer("Regular");

    await setSignup(eventId, favorite, true);
    await setSignup(eventId, regular, true);

    const participants = await listParticipants(eventId);

    expect(participants.find((item) => item.playerId === favorite)?.isPriority).toBe(true);
    expect(participants.find((item) => item.playerId === regular)?.isPriority).toBe(false);
  });

  it("поднимает избранных в начало списка участников", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });

    await addPlayer("Anna");
    await addPlayer("Zoe", 0, true);

    const participants = await listParticipants(eventId);

    expect(participants[0]?.familyName).toBe("Zoe");
  });

  it("не пускает в состав сверх лимита, пока никто не отмечен как не пришедший", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const chosen = await addPlayer("Chosen");
    const spare = await addPlayer("Spare");

    await setSignup(eventId, chosen, true);
    await setSignup(eventId, spare, true);
    await setPriority(eventId, chosen, true);

    await runDraw(eventId);

    await expect(addToRoster(eventId, spare)).rejects.toThrow(EventStateError);

    await setAttendance(eventId, chosen, false);

    await expect(addToRoster(eventId, spare)).resolves.toBeUndefined();
  });

  it("считает занятыми только тех, кто не отмечен как не пришедший", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 2 });
    const first = await addPlayer("First");
    const second = await addPlayer("Second");

    for (const id of [first, second]) await setSignup(eventId, id, true);
    await setPriority(eventId, first, true);
    await setPriority(eventId, second, true);

    await runDraw(eventId);

    expect(await countOccupiedSeats(eventId)).toBe(2);

    await setAttendance(eventId, first, false);

    expect(await countOccupiedSeats(eventId)).toBe(1);
  });

  it("не даёт разыграть пустой состав", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 2 });

    await expect(runDraw(eventId)).rejects.toThrow(EventStateError);
  });

  it("запрещает править состав после жеребьёвки", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const playerId = await addPlayer("A");

    await setSignup(eventId, playerId, true);
    await runDraw(eventId);

    await expect(setSignup(eventId, playerId, false)).rejects.toThrow(EventStateError);
  });

  it("пересчитывает долги при закрытии", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const winner = await addPlayer("Winner", 5);
    const loser = await addPlayer("Loser", 0);

    await setSignup(eventId, winner, true);
    await setSignup(eventId, loser, true);
    await setPriority(eventId, winner, true);

    await runDraw(eventId);
    await setAttendance(eventId, winner, true);
    await closeEvent(eventId);

    expect(debtOf(winner)).toBeCloseTo(5, 5);
    expect(debtOf(loser)).toBeCloseTo(0, 5);
  });

  it("сажает прогульщика на скамейку", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const winner = await addPlayer("Winner", 2);
    const other = await addPlayer("Other");

    await setSignup(eventId, winner, true);
    await setSignup(eventId, other, true);
    await setPriority(eventId, winner, false);
    await setPriority(eventId, other, false);

    await runDraw(eventId);

    const drawn = await listParticipants(eventId);
    const chosen = drawn.find((item) => item.slotSource === "lottery");
    const before = chosen?.debt ?? 0;

    await setAttendance(eventId, chosen!.playerId, false);
    await closeEvent(eventId);

    expect(debtOf(chosen!.playerId)).toBeCloseTo(before - 0.5, 5);
  });

  it("растит долг тем, кто заявился и не прошёл", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 2 });
    const boss = await addPlayer("Boss");
    const first = await addPlayer("First");
    const second = await addPlayer("Second");

    for (const id of [boss, first, second]) await setSignup(eventId, id, true);
    await setPriority(eventId, boss, true);

    await runDraw(eventId);

    const participants = await listParticipants(eventId);
    const winner = participants.find((item) => item.slotSource === "lottery");
    const missed = participants.find(
      (item) => item.slotSource === null && item.playerId !== boss,
    );

    await closeEvent(eventId);

    expect(debtOf(missed!.playerId)).toBeCloseTo(0.5, 5);
    expect(debtOf(winner!.playerId)).toBeCloseTo(-0.5, 5);
    expect(debtOf(boss)).toBeCloseTo(0, 5);
  });

  it("не начисляет долг, когда свободных слотов не осталось", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const boss = await addPlayer("Boss");
    const waiting = await addPlayer("Waiting");

    await setSignup(eventId, boss, true);
    await setSignup(eventId, waiting, true);
    await setPriority(eventId, boss, true);

    await runDraw(eventId);
    await closeEvent(eventId);

    expect(debtOf(waiting)).toBeCloseTo(0, 5);
    expect(debtOf(boss)).toBeCloseTo(0, 5);
  });

  it("выпускает того, у кого долг больше", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const owed = await addPlayer("Owed", 9);
    const spent = await addPlayer("Spent", -9);

    await setSignup(eventId, owed, true);
    await setSignup(eventId, spent, true);

    await runDraw(eventId);

    const participants = await listParticipants(eventId);

    expect(sourceOf(participants, owed)).toBe("lottery");
    expect(sourceOf(participants, spent)).toBeNull();
  });

  it("не начисляет долг заменившему, но вдвое списывает с прогулявшего приоритетного", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const chosen = await addPlayer("Chosen");
    const spare = await addPlayer("Spare");

    await setSignup(eventId, chosen, true);
    await setSignup(eventId, spare, true);
    await setPriority(eventId, chosen, true);

    await runDraw(eventId);
    await setAttendance(eventId, chosen, false);
    await addToRoster(eventId, spare);
    await setAttendance(eventId, spare, true);
    await closeEvent(eventId);

    expect(debtOf(spare)).toBeCloseTo(0, 5);
    expect(debtOf(chosen)).toBeCloseTo(-2, 5);
  });

  it("не трогает долг приоритетного, который пришёл", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const boss = await addPlayer("Boss", 4);

    await setSignup(eventId, boss, true);
    await setPriority(eventId, boss, true);

    await runDraw(eventId);
    await setAttendance(eventId, boss, true);
    await closeEvent(eventId);

    expect(debtOf(boss)).toBeCloseTo(4, 5);
  });

  it("не закрывает событие дважды", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", slots: 1 });
    const playerId = await addPlayer("A");

    await setSignup(eventId, playerId, true);
    await runDraw(eventId);
    await closeEvent(eventId);

    await expect(closeEvent(eventId)).rejects.toThrow(EventStateError);
  });
});
