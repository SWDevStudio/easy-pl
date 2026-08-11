import { weightOf } from "./fairness";
import { createRng } from "./random";

export const NO_RAID = 0;

export type SlotSource = "priority" | "lottery";

export interface DrawCandidate {
  playerId: number;
  raidId: number | null;
  debt: number;
  isPriority?: boolean;
}

export interface DrawQuota {
  raidId: number | null;
  slots: number;
}

export interface DrawInput {
  candidates: DrawCandidate[];
  quotas: DrawQuota[];
  seed: string;
  seatPriorityOverQuota?: boolean;
}

export interface DrawnSlot {
  playerId: number;
  source: SlotSource;
}

export interface DrawGroup {
  raidId: number | null;
  slots: number;
  priority: number;
  pool: number;
  taken: number;
  share: number;
}

export interface DrawSnapshotEntry {
  playerId: number;
  raidId: number | null;
  debt: number;
  weight: number;
  isPriority: boolean;
  key: number | null;
}

export interface DrawSnapshot {
  seed: string;
  groups: DrawGroup[];
  entries: DrawSnapshotEntry[];
}

export interface DrawResult {
  main: DrawnSlot[];
  groups: DrawGroup[];
  snapshot: DrawSnapshot;
}

export class PriorityOverflowError extends Error {
  constructor(
    readonly raidId: number | null,
    readonly priorityCount: number,
    readonly slots: number,
  ) {
    super(`Обязательных игроков ${priorityCount}, а мест ${slots}`);
    this.name = "PriorityOverflowError";
  }
}

interface RankedCandidate {
  candidate: DrawCandidate;
  key: number;
}

export function raidKeyOf(raidId: number | null): number {
  return raidId ?? NO_RAID;
}

export function raidIdOf(raidKey: number): number | null {
  return raidKey === NO_RAID ? null : raidKey;
}

export function draw(input: DrawInput): DrawResult {
  const quotas = quotaMap(input.quotas);
  const candidates = [...input.candidates].sort((left, right) => left.playerId - right.playerId);
  const main: DrawnSlot[] = [];
  const groups: DrawGroup[] = [];
  const ranked: RankedCandidate[] = [];

  for (const raidKey of raidKeys(quotas, candidates)) {
    const planned = quotas.get(raidKey) ?? 0;
    const members = candidates.filter((candidate) => raidKeyOf(candidate.raidId) === raidKey);
    const priority = members.filter((candidate) => candidate.isPriority);

    if (priority.length > planned && !input.seatPriorityOverQuota) {
      throw new PriorityOverflowError(raidIdOf(raidKey), priority.length, planned);
    }

    const slots = Math.max(planned, priority.length);
    const pool = members.filter((candidate) => !candidate.isPriority);
    const free = slots - priority.length;
    const rankedPool = rankPool(pool, createRng(`${input.seed}:${raidKey}`));
    const won = rankedPool.slice(0, free);

    ranked.push(...rankedPool);
    main.push(
      ...priority.map((candidate) => ({ playerId: candidate.playerId, source: "priority" as const })),
      ...won.map((entry) => ({ playerId: entry.candidate.playerId, source: "lottery" as const })),
    );
    groups.push({
      raidId: raidIdOf(raidKey),
      slots,
      priority: priority.length,
      pool: pool.length,
      taken: priority.length + won.length,
      share: shareOf(free, pool.length),
    });
  }

  return {
    main,
    groups,
    snapshot: {
      seed: input.seed,
      groups,
      entries: buildSnapshot(candidates, ranked),
    },
  };
}

export function unfilledOf(group: DrawGroup): number {
  return Math.max(0, group.slots - group.taken);
}

function quotaMap(quotas: DrawQuota[]): Map<number, number> {
  const map = new Map<number, number>();

  for (const quota of quotas) {
    if (quota.slots < 0) throw new RangeError("Количество мест не может быть отрицательным");

    map.set(raidKeyOf(quota.raidId), quota.slots);
  }

  return map;
}

function raidKeys(quotas: Map<number, number>, candidates: DrawCandidate[]): number[] {
  const keys = new Set([...quotas.keys(), ...candidates.map((candidate) => raidKeyOf(candidate.raidId))]);

  return [...keys].sort((left, right) => left - right);
}

function shareOf(free: number, poolSize: number): number {
  if (poolSize <= 0) return 0;

  return Math.min(1, free / poolSize);
}

function rankPool(pool: DrawCandidate[], rng: () => number): RankedCandidate[] {
  const ranked = pool.map((candidate) => {
    const uniform = Math.max(rng(), Number.MIN_VALUE);

    return { candidate, key: uniform ** (1 / weightOf(candidate)) };
  });

  return ranked.sort((left, right) => right.key - left.key);
}

function buildSnapshot(candidates: DrawCandidate[], ranked: RankedCandidate[]): DrawSnapshotEntry[] {
  const keys = new Map(ranked.map((entry) => [entry.candidate.playerId, entry.key]));

  return candidates.map((candidate) => ({
    playerId: candidate.playerId,
    raidId: candidate.raidId,
    debt: candidate.debt,
    weight: weightOf(candidate),
    isPriority: Boolean(candidate.isPriority),
    key: keys.get(candidate.playerId) ?? null,
  }));
}
