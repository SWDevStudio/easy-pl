import { readString } from "./types";

const PREFIX = "EASYPL1-";

export interface Connection {
  url: string;
  token: string;
}

export function encodeConnection(connection: Connection): string {
  const payload = JSON.stringify({ url: connection.url, token: connection.token });

  return PREFIX + toBase64Url(new TextEncoder().encode(payload));
}

export function decodeConnection(code: string): Connection {
  const trimmed = code.trim();

  if (!trimmed.startsWith(PREFIX)) {
    throw new Error("Это не код подключения — он начинается с EASYPL1-");
  }

  const parsed = parsePayload(trimmed.slice(PREFIX.length));
  const url = readString(parsed, "url");
  const token = readString(parsed, "token");

  if (!url || !token) throw new Error("В коде подключения нет адреса или ключа");

  return { url: normalizeUrl(url), token: token.trim() };
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\/sync$/i, "");

  if (!trimmed) return "";

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Адрес должен начинаться с https://");
  }

  return trimmed;
}

function parsePayload(encoded: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
  } catch {
    throw new Error("Код подключения повреждён — скопируйте его целиком, одной строкой");
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
}
