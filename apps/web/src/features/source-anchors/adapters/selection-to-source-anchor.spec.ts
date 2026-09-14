import { Editor, type JSONContent } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { StableBlockId } from '../extensions/stable-block-id'
import { selectionToSourceAnchorInput } from './selection-to-source-anchor'

function createEditor(content: JSONContent) {
  return new Editor({
    content,
    extensions: [StarterKit, StableBlockId],
  })
}

function createTextSelection(
  editor: Editor,
  blockId: string,
  startOffset: number,
  endOffset: number,
) {
  let contentStart: number | null = null

  editor.state.doc.descendants((node, position) => {
    if (node.attrs.blockId === blockId) {
      contentStart = position + 1
      return false
    }
  })

  if (contentStart === null) {
    throw new Error(`Could not find block ${blockId}.`)
  }

  return TextSelection.create(
    editor.state.doc,
    contentStart + startOffset,
    contentStart + endOffset,
  )
}

describe('selectionToSourceAnchorInput', () => {
  it('converts a single-block text selection to block-local offsets', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, blockId: 'block-heading' },
          content: [{ type: 'text', text: '前置标题会改变后续全局位置' }],
        },
        {
          type: 'paragraph',
          attrs: { blockId: 'block-target' },
          content: [{ type: 'text', text: '前缀锚点后缀' }],
        },
      ],
    })
    const selection = createTextSelection(editor, 'block-target', 2, 4)

    expect(selectionToSourceAnchorInput(selection)).toEqual({
      ok: true,
      input: {
        blockId: 'block-target',
        blockText: '前缀锚点后缀',
        startOffset: 2,
        endOffset: 4,
      },
    })

    editor.destroy()
  })

  it('rejects an empty text selection', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-empty' },
          content: [{ type: 'text', text: '原文' }],
        },
      ],
    })
    const selection = createTextSelection(editor, 'block-empty', 1, 1)

    expect(selectionToSourceAnchorInput(selection)).toEqual({
      ok: false,
      reason: 'empty-selection',
    })

    editor.destroy()
  })

  it('rejects a selection that crosses block boundaries', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-first' },
          content: [{ type: 'text', text: '第一段' }],
        },
        {
          type: 'paragraph',
          attrs: { blockId: 'block-second' },
          content: [{ type: 'text', text: '第二段' }],
        },
      ],
    })
    const from = createTextSelection(editor, 'block-first', 1, 2).from
    const to = createTextSelection(editor, 'block-second', 0, 1).to
    const selection = TextSelection.create(editor.state.doc, from, to)

    expect(selectionToSourceAnchorInput(selection)).toEqual({
      ok: false,
      reason: 'cross-block-selection',
    })

    editor.destroy()
  })

  it('rejects an anchorable block without a blockId', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-schema' },
          content: [{ type: 'text', text: '原文' }],
        },
      ],
    })
    const docWithoutBlockId = editor.schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: null },
          content: [{ type: 'text', text: '原文' }],
        },
      ],
    })
    const selection = TextSelection.create(docWithoutBlockId, 1, 2)

    expect(selectionToSourceAnchorInput(selection)).toEqual({
      ok: false,
      reason: 'missing-block-id',
    })

    editor.destroy()
  })

  it('rejects inline leaf nodes whose positions do not match textContent offsets', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-hard-break' },
          content: [
            { type: 'text', text: '前' },
            { type: 'hardBreak' },
            { type: 'text', text: '后' },
          ],
        },
      ],
    })
    const selection = createTextSelection(editor, 'block-hard-break', 0, 3)

    expect(selectionToSourceAnchorInput(selection)).toEqual({
      ok: false,
      reason: 'unsupported-inline-content',
    })

    editor.destroy()
  })

  it('rejects non-text selections', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-node-selection' },
          content: [{ type: 'text', text: '原文' }],
        },
      ],
    })
    const selection = NodeSelection.create(editor.state.doc, 0)

    expect(selectionToSourceAnchorInput(selection)).toEqual({
      ok: false,
      reason: 'unsupported-selection',
    })

    editor.destroy()
  })
})
