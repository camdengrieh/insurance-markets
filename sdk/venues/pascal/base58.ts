// A Solana address is the base58 text of a 32-byte public key. The adapter puts the owner into a request path,
// so it checks the text is exactly that (alphabet, length and decoded size) before anything leaves the page.
// No checksum exists in the format; this only rejects what cannot be an address.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX: ReadonlyMap<string, number> = new Map(Array.from(ALPHABET, (char, index) => [char, index] as const));

export function decodeBase58(text: string): Uint8Array | null {
  if (text.length === 0 || text.length > 64) return null;
  let value = 0n;
  for (const char of text) {
    const digit = INDEX.get(char);
    if (digit === undefined) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  // Each leading "1" is one leading zero byte.
  for (const char of text) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

// True for text that decodes to exactly 32 bytes.
export function isSolanaAddress(text: unknown): text is string {
  if (typeof text !== "string" || text.length < 32 || text.length > 44) return false;
  const bytes = decodeBase58(text);
  return bytes !== null && bytes.length === 32;
}
