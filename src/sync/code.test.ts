import { describe, expect, it } from "vitest";
import { decodeConnection, encodeConnection, normalizeUrl } from "./code";

describe("код подключения", () => {
  it("переживает круговой обход", () => {
    const code = encodeConnection({ url: "https://easy-pl.workers.dev", token: "секретный-ключ" });

    expect(decodeConnection(code)).toEqual({
      url: "https://easy-pl.workers.dev",
      token: "секретный-ключ",
    });
  });

  it("терпит переносы и пробелы вокруг", () => {
    const code = encodeConnection({ url: "https://easy-pl.workers.dev", token: "ключ" });

    expect(decodeConnection(`\n  ${code}  \n`).token).toBe("ключ");
  });

  it("отбрасывает чужую строку", () => {
    expect(() => decodeConnection("https://easy-pl.workers.dev")).toThrow(/код подключения/i);
  });

  it("отбрасывает обрезанный код", () => {
    const code = encodeConnection({ url: "https://easy-pl.workers.dev", token: "ключ" });

    expect(() => decodeConnection(code.slice(0, code.length - 6))).toThrow(/повреждён|нет адреса/i);
  });

  it("срезает хвостовые слэши и /sync", () => {
    expect(normalizeUrl("https://easy-pl.workers.dev/sync")).toBe("https://easy-pl.workers.dev");
    expect(normalizeUrl("https://easy-pl.workers.dev///")).toBe("https://easy-pl.workers.dev");
  });

  it("требует схему", () => {
    expect(() => normalizeUrl("easy-pl.workers.dev")).toThrow(/https/i);
  });

  it("нормализует адрес из кода", () => {
    const code = encodeConnection({ url: "https://easy-pl.workers.dev/sync/", token: "ключ" });

    expect(decodeConnection(code).url).toBe("https://easy-pl.workers.dev");
  });
});
