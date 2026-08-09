import { describe, expect, it } from "vitest";
import { draw, PriorityOverflowError, type DrawCandidate } from "./draw";
import { nextDebt, weightOf } from "./fairness";

function pool(debts: number[], priorityIds: number[] = []): DrawCandidate[] {
  return debts.map((debt, index) => ({
    playerId: index + 1,
    debt,
    isPriority: priorityIds.includes(index + 1),
  }));
}

describe("draw", () => {
  it("отдаёт слоты приоритетным игрокам вне жребия", () => {
    const result = draw({ candidates: pool([0, 0, 0, 0], [3]), slots: 2, seed: "seed-1" });

    expect(result.main).toHaveLength(2);
    expect(result.main[0]).toEqual({ playerId: 3, source: "priority" });
    expect(result.main.filter((slot) => slot.source === "lottery")).toHaveLength(1);
  });

  it("падает, если приоритетных больше, чем слотов", () => {
    expect(() => draw({ candidates: pool([0, 0, 0], [1, 2, 3]), slots: 2, seed: "s" })).toThrow(
      PriorityOverflowError,
    );
  });

  it("воспроизводится по seed", () => {
    const input = { candidates: pool([0, 2, 4, 1, 7, 0]), slots: 3, seed: "осада-2026-08-09" };

    expect(draw(input)).toEqual(draw(input));
  });

  it("даёт разный результат на разных seed", () => {
    const candidates = pool([0, 0, 0, 0, 0, 0, 0, 0]);
    const first = draw({ candidates, slots: 3, seed: "a" }).main.map((slot) => slot.playerId);
    const second = draw({ candidates, slots: 3, seed: "b" }).main.map((slot) => slot.playerId);

    expect(first).not.toEqual(second);
  });

  it("не выдаёт больше слотов, чем есть", () => {
    const result = draw({ candidates: pool([0, 1, 2, 3, 4, 5]), slots: 2, seed: "s" });

    expect(result.main).toHaveLength(2);
    expect(new Set(result.main.map((slot) => slot.playerId)).size).toBe(2);
  });

  it("не падает, когда кандидатов меньше, чем слотов", () => {
    const result = draw({ candidates: pool([0, 0]), slots: 10, seed: "s" });

    expect(result.main).toHaveLength(2);
    expect(result.share).toBe(1);
  });

  it("считает долю свободных мест на всех участников жребия", () => {
    const result = draw({ candidates: pool([0, 0, 0, 0], [1]), slots: 2, seed: "s" });

    expect(result.share).toBeCloseTo(1 / 3, 5);
  });

  it("выбирает пропорционально весу", () => {
    const runs = 20000;
    let heavyWins = 0;

    for (let index = 0; index < runs; index += 1) {
      const result = draw({
        candidates: [
          { playerId: 1, debt: 0 },
          { playerId: 2, debt: 8 },
        ],
        slots: 1,
        seed: `run-${index}`,
      });

      if (result.main[0]?.playerId === 2) heavyWins += 1;
    }

    expect(heavyWins / runs).toBeGreaterThan(0.87);
    expect(heavyWins / runs).toBeLessThan(0.93);
  });

  it.each([
    { players: 20, slots: 10, events: 200 },
    { players: 40, slots: 10, events: 200 },
    { players: 60, slots: 10, events: 200 },
    { players: 25, slots: 20, events: 100 },
  ])("выравнивает явку: $players игроков, $slots слотов", ({ players, slots, events }) => {
    const roster = Array.from({ length: players }, (_, index) => ({ playerId: index + 1, debt: 0 }));
    const attended = new Map(roster.map((player) => [player.playerId, 0]));

    for (let event = 0; event < events; event += 1) {
      const result = draw({ candidates: roster, slots, seed: `event-${event}` });
      const winners = new Set(result.main.map((slot) => slot.playerId));

      for (const player of roster) {
        const gotSlot = winners.has(player.playerId);
        if (gotSlot) attended.set(player.playerId, (attended.get(player.playerId) ?? 0) + 1);

        player.debt = nextDebt({
          debt: player.debt,
          signedUp: true,
          gotSlot,
          outsideLottery: false,
          showedUp: gotSlot ? true : null,
          share: result.share,
        });
      }
    }

    const counts = [...attended.values()];

    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(4);
  });
});

describe("nextDebt", () => {
  it("считает вес от долга", () => {
    expect(weightOf({ debt: 0 })).toBe(1);
    expect(weightOf({ debt: 3 })).toBe(4);
    expect(weightOf({ debt: -5 })).toBe(0.25);
  });

  const base = { signedUp: true, outsideLottery: false, showedUp: null } as const;

  it("не трогает тех, кто не заявился", () => {
    expect(nextDebt({ ...base, debt: 2, signedUp: false, gotSlot: false, share: 0.5 })).toBe(2);
  });

  it("растит долг не попавшим на долю слотов", () => {
    expect(nextDebt({ ...base, debt: 0, gotSlot: false, share: 0.25 })).toBe(0.25);
  });

  it("списывает с попавших остаток доли", () => {
    expect(nextDebt({ ...base, debt: 0, gotSlot: true, showedUp: true, share: 0.25 })).toBe(-0.75);
  });

  it("не различает пришедших и прогулявших в жребии — очередь потрачена в обоих случаях", () => {
    const came = nextDebt({ ...base, debt: 2, gotSlot: true, showedUp: true, share: 0.5 });
    const skipped = nextDebt({ ...base, debt: 2, gotSlot: true, showedUp: false, share: 0.5 });

    expect(came).toBe(1.5);
    expect(skipped).toBe(1.5);
  });

  it("не трогает долг прошедших вне жребия, если они пришли", () => {
    expect(
      nextDebt({ ...base, debt: 4, gotSlot: true, outsideLottery: true, showedUp: true, share: 0.5 }),
    ).toBe(4);
    expect(
      nextDebt({ ...base, debt: 4, gotSlot: true, outsideLottery: true, showedUp: null, share: 0.5 }),
    ).toBe(4);
  });

  it("списывает вдвое с прогулявших вне жребия", () => {
    const normal = nextDebt({ ...base, debt: 0, gotSlot: true, showedUp: true, share: 0.5 });
    const skipped = nextDebt({
      ...base,
      debt: 0,
      gotSlot: true,
      outsideLottery: true,
      showedUp: false,
      share: 0.5,
    });

    expect(normal).toBe(-0.5);
    expect(skipped).toBe(-1);
    expect(skipped).toBe(normal * 2);
  });

  it("держит долг в капе", () => {
    expect(nextDebt({ ...base, debt: 10, gotSlot: false, share: 0.5 })).toBe(10);
    expect(nextDebt({ ...base, debt: 3, gotSlot: false, share: 0.5, cap: 3 })).toBe(3);
    expect(
      nextDebt({
        ...base,
        debt: -10,
        gotSlot: true,
        outsideLottery: true,
        showedUp: false,
        share: 0,
      }),
    ).toBe(-10);
  });
});
