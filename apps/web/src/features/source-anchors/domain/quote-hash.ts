const FNV1A_OFFSET_BASIS = 0x811c9dc5
const FNV1A_PRIME = 0x01000193

export const QUOTE_HASH_VERSION = 'fnv1a32-v1'

export function hashSourceQuote(quote: string): string {
  let hash = FNV1A_OFFSET_BASIS

  for (const byte of new TextEncoder().encode(quote)) {
    hash ^= byte
    hash = Math.imul(hash, FNV1A_PRIME)
  }

  return `${QUOTE_HASH_VERSION}:${(hash >>> 0).toString(16).padStart(8, '0')}`
}
