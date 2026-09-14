import type { JSONContent } from '@tiptap/core'

export const sampleNoteContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2, blockId: 'block-intro-title' },
      content: [{ type: 'text', text: '如何判断 AI 笔记是否可靠' }],
    },
    {
      type: 'paragraph',
      attrs: { blockId: 'block-intro-problem' },
      content: [
        {
          type: 'text',
          text: '如果 ThoughtNode 不能回到原文，用户就无法判断模型结构是否真的来自笔记。',
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: { blockId: 'block-intro-anchor' },
      content: [
        {
          type: 'text',
          text: 'M2 的第一步是让原文块拥有稳定身份，再把节点和原文区间连接起来。',
        },
      ],
    },
  ],
}
