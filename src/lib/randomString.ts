const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A random string from `alphabet` (no look-alike characters by default), uniformly distributed. */
export function randomString(length: number, alphabet = ALPHABET): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  // Rejection sampling keeps the distribution uniform.
  let out = '';
  let i = 0;
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    if (i >= bytes.length) {
      globalThis.crypto.getRandomValues(bytes);
      i = 0;
    }
    const b = bytes[i++]!;
    if (b < limit) out += alphabet[b % alphabet.length];
  }
  return out;
}
