import { describe, expect, it } from "vitest";
import {
  draw,
  PriorityOverflowError,
  unfilledOf,
  type DrawCandidate,
  type DrawGroup,
  type DrawResult,
} from "./draw";
import { nextDebt, weightOf } from "./fairness";

function pool(debts: number[], priorityIds: number[] = [], raidId: number | null = null): DrawCandidate[] {
  return debts.map((debt, index) => ({
    playerId: index + 1,
    raidId,
    debt,
    isPriority: priorityIds.includes(index + 1),
  }));
}

function quota(slots: number, raidId: number | null = null) {
  return [{ raidId, slots }];
}

function idsOf(result: DrawResult): number[] {
  return result.main.map((slot) => slot.playerId).sort((left, right) => left - right);
}

function groupOf(result: DrawResult, raidId: number | null): DrawGroup | undefined {
  return result.groups.find((group) => group.raidId === raidId);
}

describe("draw", () => {
  it("отдаёт слоты приоритетным игрокам вне жребия", () => {
    const result = draw({ candidates: pool([0, 0, 0, 0], [3]), quotas: quota(2), seed: "seed-1" });

    expect(result.main).toHaveLength(2);
    expect(result.main[0]).toEqual({ playerId: 3, source: "priority" });
    expect(result.main.filter((slot) => slot.source === "lottery")).toHaveLength(1);
  });

  it("падает, если приоритетных больше, чем мест рейда", () => {
    expect(() =>
      draw({ candidates: pool([0, 0, 0], [1, 2, 3], 7), quotas: quota(2, 7), seed: "s" }),
    ).toThrow(PriorityOverflowError);
  });

  it("сообщает, в каком рейде приоритетных больше, чем мест", () => {
    try {
      draw({ candidates: pool([0, 0, 0], [1, 2, 3], 7), quotas: quota(2, 7), seed: "s" });
      expect.unreachable("жребий должен был упасть");
    } catch (cause) {
      expect(cause).toBeInstanceOf(PriorityOverflowError);
      expect(cause).toMatchObject({ raidId: 7, priorityCount: 3, slots: 2 });
    }
  });

  it("выводит приоритетных сверх квоты, когда это разрешено", () => {
    const result = draw({
      candidates: pool([0, 0, 0], [1, 2, 3], 7),
      quotas: quota(2, 7),
      seed: "s",
      seatPriorityOverQuota: true,
    });

    expect(idsOf(result)).toEqual([1, 2, 3]);
    expect(groupOf(result, 7)).toMatchObject({ slots: 3, priority: 3, taken: 3, share: 0 });
  });

  it("выводит приоритетных без рейда, которым мест не выделили", () => {
    const result = draw({
      candidates: pool([0, 0, 0], [1, 2]),
      quotas: quota(0),
      seed: "s",
      seatPriorityOverQuota: true,
    });

    expect(idsOf(result)).toEqual([1, 2]);
    expect(groupOf(result, null)).toMatchObject({ slots: 2, pool: 1, taken: 2 });
  });

  it("не раздувает квоту, когда приоритетных не больше мест", () => {
    const result = draw({
      candidates: pool([0, 0, 0, 0], [1]),
      quotas: quota(2),
      seed: "s",
      seatPriorityOverQuota: true,
    });

    expect(result.main).toHaveLength(2);
    expect(groupOf(result, null)?.slots).toBe(2);
  });

  it("воспроизводится по seed", () => {
    const input = { candidates: pool([0, 2, 4, 1, 7, 0]), quotas: quota(3), seed: "осада-2026-08-09" };

    expect(draw(input)).toEqual(draw(input));
  });

  it("даёт разный результат на разных seed", () => {
    const candidates = pool([0, 0, 0, 0, 0, 0, 0, 0]);
    const first = draw({ candidates, quotas: quota(3), seed: "a" }).main.map((slot) => slot.playerId);
    const second = draw({ candidates, quotas: quota(3), seed: "b" }).main.map((slot) => slot.playerId);

    expect(first).not.toEqual(second);
  });

  it("не выдаёт больше слотов, чем есть", () => {
    const result = draw({ candidates: pool([0, 1, 2, 3, 4, 5]), quotas: quota(2), seed: "s" });

    expect(result.main).toHaveLength(2);
    expect(new Set(result.main.map((slot) => slot.playerId)).size).toBe(2);
  });

  it("не падает, когда кандидатов меньше, чем слотов", () => {
    const result = draw({ candidates: pool([0, 0]), quotas: quota(10), seed: "s" });

    expect(result.main).toHaveLength(2);
    expect(groupOf(result, null)?.share).toBe(1);
  });

  it("считает долю свободных мест на всех участников жребия рейда", () => {
    const result = draw({ candidates: pool([0, 0, 0, 0], [1]), quotas: quota(2), seed: "s" });

    expect(groupOf(result, null)?.share).toBeCloseTo(1 / 3, 5);
  });

  it("выбирает пропорционально весу", () => {
    const runs = 20000;
    let heavyWins = 0;

    for (let index = 0; index < runs; index += 1) {
      const result = draw({
        candidates: [
          { playerId: 1, raidId: null, debt: 0 },
          { playerId: 2, raidId: null, debt: 8 },
        ],
        quotas: quota(1),
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
    const roster = Array.from({ length: players }, (_, index) => ({
      playerId: index + 1,
      raidId: null,
      debt: 0,
    }));
    const attended = new Map(roster.map((player) => [player.playerId, 0]));

    for (let event = 0; event < events; event += 1) {
      const result = draw({ candidates: roster, quotas: quota(slots), seed: `event-${event}` });
      const winners = new Set(result.main.map((slot) => slot.playerId));
      const share = groupOf(result, null)?.share ?? 0;

      for (const player of roster) {
        const gotSlot = winners.has(player.playerId);
        if (gotSlot) attended.set(player.playerId, (attended.get(player.playerId) ?? 0) + 1);

        player.debt = nextDebt({
          debt: player.debt,
          signedUp: true,
          gotSlot,
          outsideLottery: false,
          showedUp: gotSlot ? true : null,
          share,
        });
      }
    }

    const counts = [...attended.values()];

    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(5);
  });
});

describe("места по рейдам", () => {
  const mixed: DrawCandidate[] = [
    { playerId: 1, raidId: 1, debt: 0 },
    { playerId: 2, raidId: 1, debt: 0 },
    { playerId: 3, raidId: 1, debt: 0 },
    { playerId: 4, raidId: 2, debt: 0 },
    { playerId: 5, raidId: 2, debt: 0 },
    { playerId: 6, raidId: null, debt: 0 },
    { playerId: 7, raidId: null, debt: 0 },
  ];

  it("разыгрывает места каждого рейда только среди его игроков", () => {
    const result = draw({
      candidates: mixed,
      quotas: [
        { raidId: 1, slots: 2 },
        { raidId: 2, slots: 1 },
        { raidId: null, slots: 1 },
      ],
      seed: "s",
    });

    const winners = new Set(idsOf(result));

    expect([...winners].filter((id) => id <= 3)).toHaveLength(2);
    expect([...winners].filter((id) => id === 4 || id === 5)).toHaveLength(1);
    expect([...winners].filter((id) => id >= 6)).toHaveLength(1);
  });

  it("не отдаёт недобор одного рейда другому", () => {
    const result = draw({
      candidates: mixed,
      quotas: [
        { raidId: 1, slots: 1 },
        { raidId: 2, slots: 4 },
        { raidId: null, slots: 0 },
      ],
      seed: "s",
    });

    expect(idsOf(result).filter((id) => id <= 3)).toHaveLength(1);
    expect(idsOf(result).filter((id) => id === 4 || id === 5)).toEqual([4, 5]);
    expect(idsOf(result).filter((id) => id >= 6)).toEqual([]);
    expect(unfilledOf(groupOf(result, 2)!)).toBe(2);
    expect(unfilledOf(groupOf(result, 1)!)).toBe(0);
  });

  it("оставляет без мест рейд, которому их не указали", () => {
    const result = draw({ candidates: mixed, quotas: [{ raidId: 1, slots: 2 }], seed: "s" });

    expect(idsOf(result)).toEqual([...idsOf(result).filter((id) => id <= 3)]);
    expect(idsOf(result)).toHaveLength(2);
    expect(groupOf(result, 2)?.slots).toBe(0);
    expect(groupOf(result, null)?.slots).toBe(0);
  });

  it("считает игроков без рейда отдельной группой", () => {
    const result = draw({ candidates: mixed, quotas: [{ raidId: null, slots: 2 }], seed: "s" });

    expect(idsOf(result)).toEqual([6, 7]);
    expect(groupOf(result, null)?.share).toBe(1);
  });

  it("считает долю мест по своему рейду, а не по всей осаде", () => {
    const result = draw({
      candidates: mixed,
      quotas: [
        { raidId: 1, slots: 1 },
        { raidId: 2, slots: 2 },
      ],
      seed: "s",
    });

    expect(groupOf(result, 1)?.share).toBeCloseTo(1 / 3, 5);
    expect(groupOf(result, 2)?.share).toBe(1);
    expect(groupOf(result, null)?.share).toBe(0);
  });

  it("не меняет жребий рейда, когда поменялся состав чужого", () => {
    const quotas = [
      { raidId: 1, slots: 2 },
      { raidId: 2, slots: 1 },
    ];
    const grown = [...mixed, { playerId: 8, raidId: 2, debt: 5 }];

    const before = draw({ candidates: mixed, quotas, seed: "s" });
    const after = draw({ candidates: grown, quotas, seed: "s" });

    expect(idsOf(before).filter((id) => id <= 3)).toEqual(idsOf(after).filter((id) => id <= 3));
  });

  it("падает на отрицательном числе мест", () => {
    expect(() => draw({ candidates: mixed, quotas: quota(-1), seed: "s" })).toThrow(RangeError);
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
