export type SortDirection = "asc" | "desc";

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function compareSortValues(left: unknown, right: unknown, direction: SortDirection): number {
  if (isBlank(left)) return isBlank(right) ? 0 : 1;
  if (isBlank(right)) return -1;

  return compareValues(left, right) * (direction === "asc" ? 1 : -1);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Number(right === true) - Number(left === true);
  }

  if (typeof left === "number" && typeof right === "number") return left - right;

  return String(left).localeCompare(String(right), "ru", { numeric: true, sensitivity: "base" });
}
