import { describe, expect, it } from "vitest";
import { compareSortValues, isBlank } from "./sorting";

function order(values: unknown[], direction: "asc" | "desc"): unknown[] {
  return [...values].sort((left, right) => compareSortValues(left, right, direction));
}

describe("compareSortValues", () => {
  it("сортирует числа как числа, а не как строки", () => {
    expect(order([10, 2, 100, 9], "asc")).toEqual([2, 9, 10, 100]);
    expect(order([10, 2, 100, 9], "desc")).toEqual([100, 10, 9, 2]);
  });

  it("держит пустые значения в конце независимо от направления", () => {
    const values = ["Борис", null, "Анна", undefined, ""];

    expect(order(values, "asc").slice(0, 2)).toEqual(["Анна", "Борис"]);
    expect(order(values, "desc").slice(0, 2)).toEqual(["Борис", "Анна"]);
    expect(order(values, "asc").slice(2).every(isBlank)).toBe(true);
    expect(order(values, "desc").slice(2).every(isBlank)).toBe(true);
  });

  it("ставит true выше при возрастании", () => {
    expect(order([false, true, false], "asc")).toEqual([true, false, false]);
    expect(order([false, true], "desc")).toEqual([false, true]);
  });

  it("сравнивает кириллицу по алфавиту, а не по кодам символов", () => {
    expect(order(["Ярослав", "Анна", "Ёлка", "Егор"], "asc")).toEqual([
      "Анна",
      "Егор",
      "Ёлка",
      "Ярослав",
    ]);
  });

  it("не перемешивает кириллицу с латиницей, а держит их группами", () => {
    const sorted = order(["Zulu", "Анна", "Alpha", "Яков"], "asc").join(",");

    expect(["Анна,Яков,Alpha,Zulu", "Alpha,Zulu,Анна,Яков"]).toContain(sorted);
  });

  it("понимает числа внутри строк", () => {
    expect(order(["Осада 10", "Осада 2", "Осада 1"], "asc")).toEqual([
      "Осада 1",
      "Осада 2",
      "Осада 10",
    ]);
  });

  it("не различает регистр при сравнении строк", () => {
    expect(compareSortValues("анна", "АННА", "asc")).toBe(0);
  });

  it("считает ноль значащим значением, а не пустым", () => {
    expect(isBlank(0)).toBe(false);
    expect(order([null, 0, 5], "asc")).toEqual([0, 5, null]);
  });
});
