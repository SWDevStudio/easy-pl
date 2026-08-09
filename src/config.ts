export interface BuiltInConnection {
  url: string;
  token: string;
}

export function builtInConnection(): BuiltInConnection {
  return { url: read("VITE_SYNC_URL"), token: read("VITE_SYNC_TOKEN") };
}

function read(key: string): string {
  const value = Reflect.get(import.meta.env, key);

  return typeof value === "string" ? value.trim() : "";
}
