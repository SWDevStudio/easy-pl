export const DEBT_CAP = 10;
export const MIN_WEIGHT = 0.25;
export const NO_SHOW_MULTIPLIER = 2;

export interface DebtOutcome {
  debt: number;
  signedUp: boolean;
  gotSlot: boolean;
  outsideLottery: boolean;
  showedUp: boolean | null;
  share: number;
  cap?: number;
}

export function weightOf(state: { debt: number }): number {
  return Math.max(MIN_WEIGHT, 1 + state.debt);
}

export function clampDebt(debt: number, cap = DEBT_CAP): number {
  return Math.max(-cap, Math.min(cap, debt));
}

export function nextDebt(outcome: DebtOutcome): number {
  const cap = outcome.cap ?? DEBT_CAP;
  const seatCost = 1 - outcome.share;

  if (!outcome.signedUp) return outcome.debt;

  if (outcome.outsideLottery) {
    if (outcome.showedUp !== false) return outcome.debt;

    return clampDebt(outcome.debt - NO_SHOW_MULTIPLIER * seatCost, cap);
  }

  if (!outcome.gotSlot) return clampDebt(outcome.debt + outcome.share, cap);

  return clampDebt(outcome.debt - seatCost, cap);
}
