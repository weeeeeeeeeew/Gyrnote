import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it, vi } from 'vitest'

import { StableBlockId } from './stable-block-id'

function createEditorWithDeterministicIds(content: object) {
  let nextId = 1

  return new Editor({
    content,
    extensions: [
      StarterKit,
      StableBlockId.configure({
        generateBlockId: () => `generated-block-${nextId++}`,
      }),
    ],
  })
}

function getBlockIds(editor: Editor) {
  const blockIds: string[] = []

  editor.state.doc.descendants((node) => {
    if (typeof node.attrs.blockId === 'string') {
      blockIds.push(node.attrs.blockId)
    }
  })

  return blockIds
}

describe('StableBlockId', () => {
  it('adds blockId to anchorable blocks that do not have one', async () => {
    const editor = createEditorWithDeterministicIds({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '这段还没有稳定块 ID。' }],
        },
      ],
    })

    await vi.waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        content: [{ attrs: { blockId: 'generated-block-1' } }],
      })
    })

    editor.destroy()
  })

  it('keeps existing blockId after text edits', () => {
    const editor = createEditorWithDeterministicIds({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-existing' },
          content: [{ type: 'text', text: '已有 ID 的段落。' }],
        },
      ],
    })

    editor.commands.insertContent('继续写一点')

    expect(editor.getJSON()).toMatchObject({
      content: [{ attrs: { blockId: 'block-existing' } }],
    })

    editor.destroy()
  })

  it('replaces duplicate blockIds while keeping the first occurrence stable', async () => {
    const editor = createEditorWithDeterministicIds({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: 'block-duplicate' } },
        { type: 'paragraph', attrs: { blockId: 'block-duplicate' } },
      ],
    })

    await vi.waitFor(() => {
      expect(getBlockIds(editor)).toEqual(['block-duplicate', 'generated-block-1'])
    })

    editor.destroy()
  })

  it('preserves blockIds after JSON serialization and reload', async () => {
    const firstEditor = createEditorWithDeterministicIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '保存再加载。' }] }],
    })
    await vi.waitFor(() => {
      expect(getBlockIds(firstEditor)).toEqual(['generated-block-1'])
    })

    const serializedContent = firstEditor.getJSON()
    firstEditor.destroy()

    const reloadedEditor = createEditorWithDeterministicIds(serializedContent)

    await vi.waitFor(() => {
      expect(getBlockIds(reloadedEditor)).toEqual(['generated-block-1'])
    })

    reloadedEditor.destroy()
  })

  it('keeps the same blockId through text undo and redo', () => {
    const editor = createEditorWithDeterministicIds({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'block-history' },
          content: [{ type: 'text', text: '原文' }],
        },
      ],
    })

    editor.commands.insertContent('继续')
    editor.commands.undo()
    expect(getBlockIds(editor)).toEqual(['block-history'])

    editor.commands.redo()
    expect(getBlockIds(editor)).toEqual(['block-history'])

    editor.destroy()
  })
})
