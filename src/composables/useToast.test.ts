import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./useToast";

const toast = useToast();

beforeEach(() => {
  vi.useFakeTimers();
  toast.clear();
});

afterEach(() => {
  toast.clear();
  vi.useRealTimers();
});

describe("тосты", () => {
  it("очередь общая для всех, кто позвал composable", () => {
    useToast().success("Данные сохранены");

    expect(toast.items.value.map((item) => item.text)).toEqual(["Данные сохранены"]);
  });

  it("успех и ошибка отличаются классом", () => {
    toast.success("Готово");
    toast.error("Не вышло");

    expect(toast.items.value.map((item) => item.class)).toEqual(["alert-success", "alert-error"]);
  });

  it("пропадает сам", () => {
    toast.success("Готово");
    vi.advanceTimersByTime(3999);

    expect(toast.items.value).toHaveLength(1);

    vi.advanceTimersByTime(2);

    expect(toast.items.value).toHaveLength(0);
  });

  it("ошибка висит дольше успеха", () => {
    toast.success("Готово");
    toast.error("Не вышло");
    vi.advanceTimersByTime(4001);

    expect(toast.items.value.map((item) => item.text)).toEqual(["Не вышло"]);
  });

  it("закрывается вручную и не всплывает потом снова", () => {
    const id = toast.success("Готово");

    toast.dismiss(id);

    expect(toast.items.value).toHaveLength(0);

    vi.advanceTimersByTime(10_000);

    expect(toast.items.value).toHaveLength(0);
  });

  it("не растёт бесконечно", () => {
    for (let index = 0; index < 10; index += 1) toast.success(`Сообщение ${index}`);

    expect(toast.items.value).toHaveLength(4);
    expect(toast.items.value[0]?.text).toBe("Сообщение 6");
  });

  it("нулевой таймаут оставляет плашку висеть", () => {
    toast.show({ text: "Навсегда", timeout: 0 });
    vi.advanceTimersByTime(60_000);

    expect(toast.items.value).toHaveLength(1);
  });
});
