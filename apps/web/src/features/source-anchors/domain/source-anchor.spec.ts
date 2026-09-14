import { describe, expect, it, vi } from 'vitest'

import { createSourceAnchor } from './source-anchor'

describe('createSourceAnchor', () => {
  it('creates an anchor from a valid range inside one block', () => {
    const hashQuote = vi.fn<(quote: string) => string>((quote) => `hash:${quote}`)

    const anchor = createSourceAnchor(
      {
        blockId: 'block-intro',
        blockText: '稳定块 ID 让锚点可以重新定位。',
        startOffset: 8,
        endOffset: 10,
      },
      hashQuote,
    )

    expect(anchor).toEqual({
      blockId: 'block-intro',
      startOffset: 8,
      endOffset: 10,
      quote: '锚点',
      quoteHash: 'hash:锚点',
    })
    expect(hashQuote).toHaveBeenCalledOnce()
    expect(hashQuote).toHaveBeenCalledWith('锚点')
  })

  it('rejects a blank blockId before hashing', () => {
    const hashQuote = vi.fn<(quote: string) => string>((quote) => `hash:${quote}`)

    expect(() =>
      createSourceAnchor(
        {
          blockId: '   ',
          blockText: '原文',
          startOffset: 0,
          endOffset: 1,
        },
        hashQuote,
      ),
    ).toThrow(/blockId/)
    expect(hashQuote).not.toHaveBeenCalled()
  })

  it.each([
    ['a negative startOffset', -1, 1],
    ['an empty range', 1, 1],
    ['a reversed range', 2, 1],
    ['an endOffset beyond the block', 0, 3],
    ['a fractional startOffset', 0.5, 1],
    ['a fractional endOffset', 0, 1.5],
  ])('rejects %s', (_caseName, startOffset, endOffset) => {
    const hashQuote = vi.fn<(quote: string) => string>((quote) => `hash:${quote}`)

    expect(() =>
      createSourceAnchor(
        {
          blockId: 'block-valid',
          blockText: '原文',
          startOffset,
          endOffset,
        },
        hashQuote,
      ),
    ).toThrow(/offset/i)
    expect(hashQuote).not.toHaveBeenCalled()
  })
})
