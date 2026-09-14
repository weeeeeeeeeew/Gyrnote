import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { TextSelection, type Selection } from '@tiptap/pm/state'

import type { CreateSourceAnchorInput } from '../domain/source-anchor'
import { nodeNeedsBlockId } from '../extensions/stable-block-id'

export type SourceSelectionFailureReason =
  | 'empty-selection'
  | 'unsupported-selection'
  | 'unsupported-block'
  | 'cross-block-selection'
  | 'missing-block-id'
  | 'unsupported-inline-content'

export type SourceSelectionResult =
  | { ok: true; input: CreateSourceAnchorInput }
  | { ok: false; reason: SourceSelectionFailureReason }

interface TextBlockContext {
  node: ProseMirrorNode
  contentStart: number
}

export function selectionToSourceAnchorInput(selection: Selection): SourceSelectionResult {
  if (!(selection instanceof TextSelection)) {
    return { ok: false, reason: 'unsupported-selection' }
  }

  if (selection.empty) {
    return { ok: false, reason: 'empty-selection' }
  }

  const fromBlock = findAnchorableTextBlock(selection.$from)
  const toBlock = findAnchorableTextBlock(selection.$to)

  if (!fromBlock || !toBlock) {
    return { ok: false, reason: 'unsupported-block' }
  }

  if (fromBlock.contentStart !== toBlock.contentStart) {
    return { ok: false, reason: 'cross-block-selection' }
  }

  const blockId = fromBlock.node.attrs.blockId

  if (typeof blockId !== 'string' || !blockId.trim()) {
    return { ok: false, reason: 'missing-block-id' }
  }

  if (hasUnsupportedInlineContent(fromBlock.node)) {
    return { ok: false, reason: 'unsupported-inline-content' }
  }

  return {
    ok: true,
    input: {
      blockId,
      blockText: fromBlock.node.textContent,
      startOffset: selection.from - fromBlock.contentStart,
      endOffset: selection.to - fromBlock.contentStart,
    },
  }
}

function findAnchorableTextBlock(position: ResolvedPos): TextBlockContext | null {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth)

    if (node.isTextblock && nodeNeedsBlockId(node)) {
      return {
        node,
        contentStart: position.start(depth),
      }
    }
  }

  return null
}

function hasUnsupportedInlineContent(block: ProseMirrorNode): boolean {
  let unsupported = false

  block.descendants((node) => {
    if (node.isInline && !node.isText) {
      unsupported = true
      return false
    }
  })

  return unsupported
}
