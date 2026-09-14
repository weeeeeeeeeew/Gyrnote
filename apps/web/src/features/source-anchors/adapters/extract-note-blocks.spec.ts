import { describe, expect, it } from 'vitest'

import { sampleNoteContent } from '../fixtures/sample-note-content'
import { extractNoteBlocks } from './extract-note-blocks'

describe('extractNoteBlocks (M3.L+ learning checkpoint)', () => {
  it('extracts heading and paragraph blocks with stable ids and text', () => {
    expect(extractNoteBlocks(sampleNoteContent)).toEqual([
      {
        id: 'block-intro-title',
        text: '如何判断 AI 笔记是否可靠',
      },
      {
        id: 'block-intro-problem',
        text: '如果 ThoughtNode 不能回到原文，用户就无法判断模型结构是否真的来自笔记。',
      },
      {
        id: 'block-intro-anchor',
        text: 'M2 的第一步是让原文块拥有稳定身份，再把节点和原文区间连接起来。',
      },
    ])
  })

  it('skips blocks without blockId or with blank text', () => {
    expect(
      extractNoteBlocks({
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { blockId: 'block-a' }, content: [{ type: 'text', text: '有内容' }] },
          { type: 'paragraph', attrs: { blockId: 'block-b' }, content: [{ type: 'text', text: '   ' }] },
          { type: 'paragraph', attrs: { blockId: null }, content: [{ type: 'text', text: '无 id' }] },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    attrs: { blockId: 'block-nested' },
                    content: [{ type: 'text', text: '嵌套段落' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      { id: 'block-a', text: '有内容' },
      { id: 'block-nested', text: '嵌套段落' },
    ])
  })
})
