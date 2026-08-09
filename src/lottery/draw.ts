import { weightOf } from "./fairness";
import { createRng } from "./random";

export type SlotSource = "priority" | "lottery";

export interface DrawCandidate {
  playerId: number;
  debt: number;
  isPriority?: boolean;
}

export interface DrawInput {
  candidates: DrawCandidate[];
  slots: number;
  seed: string;
}

export interface DrawnSlot {
  playerId: number;
  source: SlotSource;
}

export interface DrawSnapshotEntry {
  playerId: number;
  debt: number;
  weight: number;
  isPriority: boolean;
  key: number | null;
}

export interface DrawSnapshot {
  seed: string;
  slots: number;
  share: number;
  entries: DrawSnapshotEntry[];
}

export interface DrawResult {
  main: DrawnSlot[];
  share: number;
  snapshot: DrawSnapshot;
}

export class PriorityOverflowError extends Error {
  constructor(
    readonly priorityCount: number,
    readonly slots: number,
  ) {
    super(`Приоритетных игроков ${priorityCount}, а слотов ${slots}`);
    this.name = "PriorityOverflowError";
  }
}

interface RankedCandidate {
  candidate: DrawCandidate;
  key: number;
}

export function draw(input: DrawInput): DrawResult {
  if (input.slots < 0) throw new RangeError("Количество слотов не может быть отрицательным");

  const candidates = [...input.candidates].sort((left, right) => left.playerId - right.playerId);
  const priority = candidates.filter((candidate) => candidate.isPriority);

  if (priority.length > input.slots) throw new PriorityOverflowError(priority.length, input.slots);

  const pool = candidates.filter((candidate) => !candidate.isPriority);
  const free = input.slots - priority.length;
  const share = shareOf(free, pool.length);

  const ranked = rankPool(pool, createRng(input.seed));
  const drawn = ranked.slice(0, free);

  return {
    main: [
      ...priority.map((candidate) => ({ playerId: candidate.playerId, source: "priority" as const })),
      ...drawn.map((entry) => ({ playerId: entry.candidate.playerId, source: "lottery" as const })),
    ],
    share,
    snapshot: {
      seed: input.seed,
      slots: input.slots,
      share,
      entries: buildSnapshot(candidates, ranked),
    },
  };
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
    debt: candidate.debt,
    weight: weightOf(candidate),
    isPriority: Boolean(candidate.isPriority),
    key: keys.get(candidate.playerId) ?? null,
  }));
}
