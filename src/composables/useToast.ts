import { readonly, ref } from "vue";

export interface Toast {
  id: number;
  text: string;
  class: string;
  timeout: number;
}

export interface ToastOptions {
  text: string;
  class?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 4000;
const ERROR_TIMEOUT = 8000;
const LIMIT = 4;

const items = ref<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

let nextId = 1;

export function useToast() {
  function show(options: ToastOptions): number {
    const id = nextId++;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    items.value = [...items.value, { id, text: options.text, class: options.class ?? "", timeout }].slice(
      -LIMIT,
    );

    if (timeout > 0) timers.set(id, setTimeout(() => dismiss(id), timeout));

    return id;
  }

  function success(text: string): number {
    return show({ text, class: "alert-success" });
  }

  function error(text: string): number {
    return show({ text, class: "alert-error", timeout: ERROR_TIMEOUT });
  }

  function dismiss(id: number): void {
    const timer = timers.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }

    items.value = items.value.filter((item) => item.id !== id);
  }

  function clear(): void {
    for (const timer of timers.values()) clearTimeout(timer);

    timers.clear();
    items.value = [];
  }

  return { items: readonly(items), show, success, error, dismiss, clear };
}
