import { Extension, type JSONContent } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

const stableBlockIdPluginKey = new PluginKey('stableBlockId')

export const BLOCK_ID_NODE_TYPES = ['heading', 'paragraph', 'listItem'] as const

export interface StableBlockIdOptions {
  generateBlockId: () => string
}

const MAX_BLOCK_ID_GENERATION_ATTEMPTS = 100

export const StableBlockId = Extension.create<StableBlockIdOptions>({
  name: 'stableBlockId',

  addOptions() {
    return {
      generateBlockId: () => crypto.randomUUID(),
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_ID_NODE_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              if (!attributes.blockId) {
                return {}
              }

              return { 'data-block-id': attributes.blockId }
            },
          },
        },
      },
    ]
  },

  onCreate() {
    // Initial editor state is not produced by a transaction, so normalize it once after creation.
    this.editor.view.dispatch(this.editor.state.tr)
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: stableBlockIdPluginKey,
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr
          const changed = ensureStableBlockIds(tr, newState.doc, this.options.generateBlockId)

          return changed ? tr.setMeta('addToHistory', false) : null
        },
      }),
    ]
  },
})

export function nodeNeedsBlockId(node: ProseMirrorNode | JSONContent): boolean {
  const nodeType = typeof node.type === 'string' ? node.type : node.type?.name

  return BLOCK_ID_NODE_TYPES.some((type) => type === nodeType)
}

export function ensureStableBlockIds(
  _tr: Transaction,
  _doc: ProseMirrorNode,
  _generateBlockId: () => string,
): boolean {
  let changed = false
  const usedBlockIds = new Set<string>()

  _doc.descendants((node, pos) => {
    if (!nodeNeedsBlockId(node)) {
      return
    }

    const currentBlockId =
      typeof node.attrs.blockId === 'string' ? node.attrs.blockId.trim() : ''

    if (currentBlockId && !usedBlockIds.has(currentBlockId)) {
      usedBlockIds.add(currentBlockId)
      return
    }

    const blockId = generateUniqueBlockId(usedBlockIds, _generateBlockId)
    _tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId })
    usedBlockIds.add(blockId)
    changed = true
  })

  return changed
}

function generateUniqueBlockId(usedBlockIds: ReadonlySet<string>, generateBlockId: () => string) {
  for (let attempt = 0; attempt < MAX_BLOCK_ID_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateBlockId().trim()

    if (candidate && !usedBlockIds.has(candidate)) {
      return candidate
    }
  }

  throw new Error('StableBlockId could not generate a unique, non-empty block ID.')
}
