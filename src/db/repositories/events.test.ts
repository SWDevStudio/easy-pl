import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSql, type Sql } from "../client";
import { runMigrations } from "../migrations";
import { EventStateError, type EventRaidSeats, type RaidQuota } from "../types";
import {
  addToRoster,
  closeEvent,
  createEvent,
  dropRaidFromEvents,
  getEvent,
  listParticipants,
  listRaidSeats,
  runDraw,
  setAttendance,
  setPriority,
  setSignup,
  setSignupRaid,
  updateEvent,
} from "./events";

let db: DatabaseSync;

function none(slots: number): RaidQuota[] {
  return [{ raidId: null, slots }];
}

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

async function addPlayer(
  name: string,
  debt = 0,
  favorite = false,
  raidId: number | null = null,
): Promise<number> {
  const info = db
    .prepare(
      `INSERT INTO players (family_name, joined_at, updated_at, debt, is_favorite, raid_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(name, "2026-08-09", "2026-08-09", debt, favorite ? 1 : 0, raidId);

  return Number(info.lastInsertRowid);
}

async function addRaid(name: string): Promise<number> {
  const info = db
    .prepare(`INSERT INTO raids (name, updated_at, uid) VALUES (?, ?, ?)`)
    .run(name, "2026-08-09T00:00:00.000Z", `raid:${name}`);

  return Number(info.lastInsertRowid);
}

function seatsOf(seats: EventRaidSeats[], raidId: number | null): EventRaidSeats | undefined {
  return seats.find((item) => item.raidId === raidId);
}

function raidOf(playerId: number): number | null {
  const rows = db.prepare("SELECT raid_id FROM players WHERE id = ?").all(playerId);
  const raidId = rows[0] === undefined ? undefined : Reflect.get(rows[0], "raid_id");

  return typeof raidId === "number" ? raidId : null;
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(2) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(2) });
    const favorite = await addPlayer("Favorite", 0, true);
    const regular = await addPlayer("Regular");

    await setSignup(eventId, favorite, true);
    await setSignup(eventId, regular, true);

    const participants = await listParticipants(eventId);

    expect(participants.find((item) => item.playerId === favorite)?.isPriority).toBe(true);
    expect(participants.find((item) => item.playerId === regular)?.isPriority).toBe(false);
  });

  it("поднимает избранных в начало списка участников", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });

    await addPlayer("Anna");
    await addPlayer("Zoe", 0, true);

    const participants = await listParticipants(eventId);

    expect(participants[0]?.familyName).toBe("Zoe");
  });

  it("не пускает в состав сверх лимита, пока никто не отмечен как не пришедший", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(2) });
    const first = await addPlayer("First");
    const second = await addPlayer("Second");

    for (const id of [first, second]) await setSignup(eventId, id, true);
    await setPriority(eventId, first, true);
    await setPriority(eventId, second, true);

    await runDraw(eventId);

    expect(seatsOf(await listRaidSeats(eventId), null)?.occupied).toBe(2);

    await setAttendance(eventId, first, false);

    expect(seatsOf(await listRaidSeats(eventId), null)?.occupied).toBe(1);
  });

  it("не даёт разыграть пустой состав", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(2) });

    await expect(runDraw(eventId)).rejects.toThrow(EventStateError);
  });

  it("запрещает править состав после жеребьёвки", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
    const playerId = await addPlayer("A");

    await setSignup(eventId, playerId, true);
    await runDraw(eventId);

    await expect(setSignup(eventId, playerId, false)).rejects.toThrow(EventStateError);
  });

  it("пересчитывает долги при закрытии", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(2) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
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

  it("выпускает того, у кого долг больше, в подавляющем большинстве жеребьёвок", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
    const owed = await addPlayer("Owed", 9);
    const spent = await addPlayer("Spent", -9);

    await setSignup(eventId, owed, true);
    await setSignup(eventId, spent, true);

    const rounds = 40;
    let owedWins = 0;

    for (let round = 0; round < rounds; round += 1) {
      await runDraw(eventId);

      const participants = await listParticipants(eventId);

      if (sourceOf(participants, owed) === "lottery") owedWins += 1;
    }

    expect(owedWins).toBeGreaterThanOrEqual(30);
  });

  it("не начисляет долг заменившему, но вдвое списывает с прогулявшего приоритетного", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
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
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
    const boss = await addPlayer("Boss", 4);

    await setSignup(eventId, boss, true);
    await setPriority(eventId, boss, true);

    await runDraw(eventId);
    await setAttendance(eventId, boss, true);
    await closeEvent(eventId);

    expect(debtOf(boss)).toBeCloseTo(4, 5);
  });

  it("не закрывает событие дважды", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(1) });
    const playerId = await addPlayer("A");

    await setSignup(eventId, playerId, true);
    await runDraw(eventId);
    await closeEvent(eventId);

    await expect(closeEvent(eventId)).rejects.toThrow(EventStateError);
  });
});

describe("места по рейдам", () => {
  it("складывает общее число мест из квот рейдов", async () => {
    const alpha = await addRaid("Альфа");
    const beta = await addRaid("Бета");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [
        { raidId: alpha, slots: 3 },
        { raidId: beta, slots: 2 },
        { raidId: null, slots: 1 },
      ],
    });

    const seats = await listRaidSeats(eventId);

    expect(seatsOf(seats, alpha)?.slots).toBe(3);
    expect(seatsOf(seats, beta)?.slots).toBe(2);
    expect(seatsOf(seats, null)?.slots).toBe(1);
    expect(seats.map((item) => item.raidName)).toEqual(["Альфа", "Бета", null]);
  });

  it("разыгрывает места рейда только среди его игроков", async () => {
    const alpha = await addRaid("Альфа");
    const beta = await addRaid("Бета");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [
        { raidId: alpha, slots: 1 },
        { raidId: beta, slots: 1 },
      ],
    });

    const first = await addPlayer("Alpha-1", 0, false, alpha);
    const second = await addPlayer("Alpha-2", 0, false, alpha);
    const third = await addPlayer("Beta-1", 0, false, beta);

    for (const id of [first, second, third]) await setSignup(eventId, id, true);
    await runDraw(eventId);

    const participants = await listParticipants(eventId);
    const chosen = participants.filter((item) => item.slotSource !== null);

    expect(chosen).toHaveLength(2);
    expect(chosen.filter((item) => item.raidId === alpha)).toHaveLength(1);
    expect(chosen.map((item) => item.playerId)).toContain(third);
  });

  it("оставляет недобор рейда пати-лидеру, а не отдаёт другому рейду", async () => {
    const alpha = await addRaid("Альфа");
    const beta = await addRaid("Бета");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [
        { raidId: alpha, slots: 3 },
        { raidId: beta, slots: 1 },
      ],
    });

    const lonely = await addPlayer("Alpha-1", 0, false, alpha);
    const crowd = await Promise.all([
      addPlayer("Beta-1", 0, false, beta),
      addPlayer("Beta-2", 0, false, beta),
      addPlayer("Beta-3", 0, false, beta),
    ]);

    for (const id of [lonely, ...crowd]) await setSignup(eventId, id, true);
    await runDraw(eventId);

    const seats = await listRaidSeats(eventId);

    expect(seatsOf(seats, alpha)?.taken).toBe(1);
    expect(seatsOf(seats, beta)?.taken).toBe(1);
    expect((await listParticipants(eventId)).filter((item) => item.slotSource !== null)).toHaveLength(2);
  });

  it("не даёт мест рейду, которому их не выделили", async () => {
    const alpha = await addRaid("Альфа");
    const beta = await addRaid("Бета");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const inside = await addPlayer("Alpha-1", 0, false, alpha);
    const outside = await addPlayer("Beta-1", 0, false, beta);

    for (const id of [inside, outside]) await setSignup(eventId, id, true);
    await runDraw(eventId);

    const participants = await listParticipants(eventId);

    expect(participants.find((item) => item.playerId === inside)?.slotSource).not.toBeNull();
    expect(participants.find((item) => item.playerId === outside)?.slotSource).toBeNull();
    expect(seatsOf(await listRaidSeats(eventId), beta)?.slots).toBe(0);
  });

  it("считает долг по доле мест своего рейда", async () => {
    const alpha = await addRaid("Альфа");
    const beta = await addRaid("Бета");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [
        { raidId: alpha, slots: 1 },
        { raidId: beta, slots: 1 },
      ],
    });

    const alphaOne = await addPlayer("Alpha-1", 0, false, alpha);
    const alphaTwo = await addPlayer("Alpha-2", 0, false, alpha);
    const betaOne = await addPlayer("Beta-1", 0, false, beta);

    for (const id of [alphaOne, alphaTwo, betaOne]) await setSignup(eventId, id, true);
    await runDraw(eventId);
    await closeEvent(eventId);

    const winner = debtOf(alphaOne) < 0 ? alphaOne : alphaTwo;
    const loser = winner === alphaOne ? alphaTwo : alphaOne;

    expect(debtOf(winner)).toBeCloseTo(-0.5, 5);
    expect(debtOf(loser)).toBeCloseTo(0.5, 5);
    expect(debtOf(betaOne)).toBeCloseTo(0, 5);
  });

  it("не пускает в состав через квоту чужого рейда", async () => {
    const alpha = await addRaid("Альфа");
    const beta = await addRaid("Бета");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const chosen = await addPlayer("Alpha-1", 0, false, alpha);
    const stranger = await addPlayer("Beta-1", 0, false, beta);
    const teammate = await addPlayer("Alpha-2", 0, false, alpha);

    for (const id of [chosen, stranger, teammate]) await setSignup(eventId, id, true);
    await setPriority(eventId, chosen, true);
    await runDraw(eventId);
    await setAttendance(eventId, chosen, false);

    await expect(addToRoster(eventId, stranger)).rejects.toThrow(EventStateError);
    await expect(addToRoster(eventId, teammate)).resolves.toBeUndefined();
  });

  it("не даёт разыграть осаду без выделенных мест", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(0) });
    const playerId = await addPlayer("A");

    await setSignup(eventId, playerId, true);

    await expect(runDraw(eventId)).rejects.toThrow(EventStateError);
  });

  it("сообщает, в каком рейде обязательных больше, чем мест", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const first = await addPlayer("Alpha-1", 0, false, alpha);
    const second = await addPlayer("Alpha-2", 0, false, alpha);

    for (const id of [first, second]) await setSignup(eventId, id, true);
    await setPriority(eventId, first, true);
    await setPriority(eventId, second, true);

    await expect(runDraw(eventId)).rejects.toThrow(/Альфа/);
  });

  it("выводит игрока в чужом рейде разово, не трогая справочник", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 2 }],
    });

    const guest = await addPlayer("Nobody-1");
    const member = await addPlayer("Alpha-1", 0, false, alpha);

    for (const id of [guest, member]) await setSignup(eventId, id, true);
    await setPriority(eventId, guest, true);
    await setSignupRaid(eventId, guest, alpha);

    const seats = await listRaidSeats(eventId);
    const participants = await listParticipants(eventId);
    const moved = participants.find((item) => item.playerId === guest);

    expect(seatsOf(seats, alpha)).toMatchObject({ signedUp: 2, priority: 1 });
    expect(seatsOf(seats, null)).toBeUndefined();
    expect(moved).toMatchObject({ raidId: alpha, raidName: "Альфа", isRaidGuest: true });
    expect(raidOf(guest)).toBeNull();

    await runDraw(eventId);

    expect(seatsOf(await listRaidSeats(eventId), alpha)?.taken).toBe(2);
    expect(raidOf(guest)).toBeNull();
  });

  it("возвращает разово выведенного в свой рейд", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const guest = await addPlayer("Nobody-1");

    await setSignup(eventId, guest, true);
    await setSignupRaid(eventId, guest, alpha);
    await setSignupRaid(eventId, guest, null);

    const participants = await listParticipants(eventId);

    expect(participants.find((item) => item.playerId === guest)).toMatchObject({
      raidId: null,
      isRaidGuest: false,
    });
    expect(seatsOf(await listRaidSeats(eventId), alpha)?.signedUp).toBe(0);
  });

  it("считает долг разово выведенного по доле принявшего рейда", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [
        { raidId: alpha, slots: 1 },
        { raidId: null, slots: 1 },
      ],
    });

    const guest = await addPlayer("Nobody-1");
    const rival = await addPlayer("Alpha-1", 0, false, alpha);
    const alone = await addPlayer("Nobody-2");

    for (const id of [guest, rival, alone]) await setSignup(eventId, id, true);
    await setSignupRaid(eventId, guest, alpha);
    await runDraw(eventId);
    await closeEvent(eventId);

    const winner = debtOf(guest) < 0 ? guest : rival;
    const loser = winner === guest ? rival : guest;

    expect(debtOf(winner)).toBeCloseTo(-0.5, 5);
    expect(debtOf(loser)).toBeCloseTo(0.5, 5);
    expect(debtOf(alone)).toBeCloseTo(0, 5);
  });

  it("возвращает разово выведенных, когда рейд удалили", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const guest = await addPlayer("Nobody-1");

    await setSignup(eventId, guest, true);
    await setSignupRaid(eventId, guest, alpha);
    await dropRaidFromEvents(alpha);

    const participants = await listParticipants(eventId);

    expect(participants.find((item) => item.playerId === guest)?.raidId).toBeNull();
    expect((await getEvent(eventId)).slots).toBe(0);
  });

  it("выводит обязательных сверх квоты, когда это подтвердили", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const first = await addPlayer("Nobody-1");
    const second = await addPlayer("Nobody-2");
    const inRaid = await addPlayer("Alpha-1", 0, false, alpha);

    for (const id of [first, second, inRaid]) await setSignup(eventId, id, true);
    await setPriority(eventId, first, true);
    await setPriority(eventId, second, true);

    await runDraw(eventId, { seatPriorityOverQuota: true });

    const participants = await listParticipants(eventId);
    const seats = await listRaidSeats(eventId);

    expect(sourceOf(participants, first)).toBe("priority");
    expect(sourceOf(participants, second)).toBe("priority");
    expect(seatsOf(seats, null)).toMatchObject({ slots: 2, taken: 2 });
    expect(seatsOf(seats, alpha)?.slots).toBe(1);
    expect((await getEvent(eventId)).slots).toBe(3);
  });

  it("разыгрывает осаду без квот, если обязательных выводят сверх них", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(0) });
    const chosen = await addPlayer("A");
    const other = await addPlayer("B");

    for (const id of [chosen, other]) await setSignup(eventId, id, true);
    await setPriority(eventId, chosen, true);

    await runDraw(eventId, { seatPriorityOverQuota: true });

    const participants = await listParticipants(eventId);

    expect(sourceOf(participants, chosen)).toBe("priority");
    expect(sourceOf(participants, other)).toBeNull();
    expect((await getEvent(eventId)).slots).toBe(1);
  });

  it("не разыгрывает осаду без квот, когда обязательных нет", async () => {
    const eventId = await createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(0) });
    const playerId = await addPlayer("A");

    await setSignup(eventId, playerId, true);

    await expect(runDraw(eventId, { seatPriorityOverQuota: true })).rejects.toThrow(EventStateError);
  });

  it("правит квоты до жеребьёвки и запирает их после", async () => {
    const alpha = await addRaid("Альфа");
    const eventId = await createEvent({
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 1 }],
    });

    const playerId = await addPlayer("Alpha-1", 0, false, alpha);

    await setSignup(eventId, playerId, true);
    await updateEvent(eventId, {
      title: "Осада",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 4 }],
    });

    expect(seatsOf(await listRaidSeats(eventId), alpha)?.slots).toBe(4);

    await runDraw(eventId);
    await updateEvent(eventId, {
      title: "Переименованная",
      eventDate: "2026-08-09",
      quotas: [{ raidId: alpha, slots: 9 }],
    });

    expect(seatsOf(await listRaidSeats(eventId), alpha)?.slots).toBe(4);
  });

  it("не принимает отрицательное число мест", async () => {
    await expect(
      createEvent({ title: "Осада", eventDate: "2026-08-09", quotas: none(-1) }),
    ).rejects.toThrow(EventStateError);
  });
});
