import { describe, expect, it } from 'vitest'

import { hashSourceQuote, QUOTE_HASH_VERSION } from './quote-hash'

describe('hashSourceQuote', () => {
  it('matches the standard FNV-1a 32-bit vector', () => {
    expect(hashSourceQuote('hello')).toBe(`${QUOTE_HASH_VERSION}:4f9f2cab`)
  })

  it('is deterministic for Unicode source text', () => {
    expect(hashSourceQuote('原文锚点')).toBe(hashSourceQuote('原文锚点'))
    expect(hashSourceQuote('原文锚点')).not.toBe(hashSourceQuote('原文锚点。'))
  })
})
