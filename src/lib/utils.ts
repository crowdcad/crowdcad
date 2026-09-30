import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Remove keys with `undefined` values from objects/arrays recursively.
export function stripUndefined<T>(input: T): T {
  if (input === undefined) return input as unknown as T;
  if (input === null) return input;

  if (Array.isArray(input)) {
    const arr = input
      .map((v) => stripUndefined(v as unknown) as unknown)
      .filter((v) => v !== undefined);
    return arr as unknown as T;
  }

  if (typeof input === 'object') {
    // Preserve non-plain objects (Date, etc.)
    const proto = Object.getPrototypeOf(input as object);
    if (proto && proto !== Object.prototype) return input;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v as unknown) as unknown;
    }
    return out as unknown as T;
  }

  return input;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost), so
// it is undefined when a LAN device opens the app at http://192.168.x.x:3000.
// Fall back to a v4 UUID built from getRandomValues, which works everywhere.
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
