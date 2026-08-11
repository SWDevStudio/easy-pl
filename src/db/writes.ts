type Listener = () => void;

const listeners = new Set<Listener>();
const WRITES = /^\s*(insert|update|delete|replace)\b/i;
const SYNCED =
  /\b(classes|raids|players|events|event_signups|event_slots|event_quotas|attendance|tombstones)\b/i;

let muted = 0;

export function onWrite(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function notifyWrite(query: string): void {
  if (muted > 0 || !WRITES.test(query) || !SYNCED.test(query)) return;

  for (const listener of listeners) listener();
}

export async function withoutTracking<TResult>(action: () => Promise<TResult>): Promise<TResult> {
  muted += 1;

  try {
    return await action();
  } finally {
    muted -= 1;
  }
}
