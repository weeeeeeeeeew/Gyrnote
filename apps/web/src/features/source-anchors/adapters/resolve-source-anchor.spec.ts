import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { hashSourceQuote } from '../domain/quote-hash'
import type { SourceAnchor } from '../domain/source-anchor'
import { StableBlockId } from '../extensions/stable-block-id'
import { resolveSourceAnchor } from './resolve-source-anchor'

function createDoc(content: JSONContent) {
  const editor = new Editor({
    content,
    extensions: [StarterKit, StableBlockId],
  })
  const doc = editor.state.doc

  return { doc, destroy: () => editor.destroy() }
}

function createAnchor(overrides: Partial<SourceAnchor> = {}): SourceAnchor {
  const quote = overrides.quote ?? '锚点'

  return {
    blockId: 'block-target',
    startOffset: 2,
    endOffset: 4,
    quote,
    quoteHash: hashSourceQuote(quote),
    ...overrides,
  }
}

describe('resolveSourceAnchor', () => {
  it('resolves a valid anchor to current ProseMirror positions', () => {
    const fixture = createDoc({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, blockId: 'block-heading' },
          content: [{ type: 'text', text: '标题' }],
        },
        {
          type: 'paragraph',
          attrs: { blockId: 'block-target' },
          content: [{ type: 'text', text: '前缀锚点后缀' }],
        },
      ],
    })

    expect(resolveSourceAnchor(fixture.doc, createAnchor(), hashSourceQuote)).toEqual({
      status: 'valid',
      from: 7,
      to: 9,
      startOffset: 2,
      endOffset: 4,
    })

    fixture.destroy()
  })

  it('recovers unique in-block drifted quotes at rate 1', () => {
    const cases = [
      { text: '新增前缀锚点后缀', quote: '锚点', startOffset: 2, endOffset: 4, expectedStart: 4, expectedEnd: 6 },
      { text: '锚点后面又写了很多字', quote: '锚点', startOffset: 10, endOffset: 12, expectedStart: 0, expectedEnd: 2 },
      { text: 'aaa锚点bbb', quote: '锚点', startOffset: 0, endOffset: 2, expectedStart: 3, expectedEnd: 5 },
    ]

    let recovered = 0
    for (const item of cases) {
      const fixture = createDoc({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: 'block-target' },
            content: [{ type: 'text', text: item.text }],
          },
        ],
      })
      const result = resolveSourceAnchor(
        fixture.doc,
        createAnchor({
          quote: item.quote,
          quoteHash: hashSourceQuote(item.quote),
          startOffset: item.startOffset,
          endOffset: item.endOffset,
        }),
        hashSourceQuote,
      )
      fixture.destroy()
      if (
        result.status === 'drifted' &&
        result.startOffset === item.expectedStart &&
        result.endOffset === item.expectedEnd
      ) {
        recovered += 1
      }
    }

    expect(recovered / cases.length).toBe(1)
  })

  it('relocates a uniquely matching quote when its block-local offsets drift', () => {
    const fixture = createDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-target' },
          content: [{ type: 'text', text: '新增前缀锚点后缀' }],
        },
      ],
    })

    expect(resolveSourceAnchor(fixture.doc, createAnchor(), hashSourceQuote)).toEqual({
      status: 'drifted',
      from: 5,
      to: 7,
      startOffset: 4,
      endOffset: 6,
    })

    fixture.destroy()
  })

  it('rejects a quote that no longer exists in its block', () => {
    const fixture = createDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-target' },
          content: [{ type: 'text', text: '前缀内容已修改' }],
        },
      ],
    })

    expect(resolveSourceAnchor(fixture.doc, createAnchor(), hashSourceQuote)).toEqual({
      status: 'invalid',
      reason: 'quote-not-found',
    })

    fixture.destroy()
  })

  it('rejects an ambiguous quote instead of guessing a new range', () => {
    const fixture = createDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-target' },
          content: [{ type: 'text', text: '锚点与锚点都可能匹配' }],
        },
      ],
    })

    expect(resolveSourceAnchor(fixture.doc, createAnchor(), hashSourceQuote)).toEqual({
      status: 'invalid',
      reason: 'ambiguous-quote',
    })

    fixture.destroy()
  })

  it('rejects a missing block and a mismatched quote hash', () => {
    const fixture = createDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-other' },
          content: [{ type: 'text', text: '原文' }],
        },
      ],
    })

    expect(resolveSourceAnchor(fixture.doc, createAnchor(), hashSourceQuote)).toEqual({
      status: 'invalid',
      reason: 'missing-block',
    })
    expect(
      resolveSourceAnchor(
        fixture.doc,
        createAnchor({ blockId: 'block-other', quoteHash: 'fnv1a32-v1:00000000' }),
        hashSourceQuote,
      ),
    ).toEqual({ status: 'invalid', reason: 'quote-hash-mismatch' })

    fixture.destroy()
  })
})
