import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

import type { QuoteHasher, SourceAnchor, SourceAnchorStatus } from '../domain/source-anchor'
import { nodeNeedsBlockId } from '../extensions/stable-block-id'

export type InvalidSourceAnchorReason =
  | 'quote-hash-mismatch'
  | 'invalid-range'
  | 'missing-block'
  | 'ambiguous-block-id'
  | 'unsupported-inline-content'
  | 'quote-not-found'
  | 'ambiguous-quote'

export type ResolveSourceAnchorResult =
  | {
      status: Exclude<SourceAnchorStatus, 'invalid'>
      from: number
      to: number
      startOffset: number
      endOffset: number
    }
  | { status: 'invalid'; reason: InvalidSourceAnchorReason }

interface BlockMatch {
  node: ProseMirrorNode
  contentStart: number
}

export function resolveSourceAnchor(
  doc: ProseMirrorNode,
  anchor: SourceAnchor,
  hashQuote: QuoteHasher,
): ResolveSourceAnchorResult {
  if (!anchor.quote || hashQuote(anchor.quote) !== anchor.quoteHash) {
    return { status: 'invalid', reason: 'quote-hash-mismatch' }
  }

  if (
    !Number.isInteger(anchor.startOffset) ||
    !Number.isInteger(anchor.endOffset) ||
    anchor.startOffset < 0 ||
    anchor.startOffset >= anchor.endOffset
  ) {
    return { status: 'invalid', reason: 'invalid-range' }
  }

  const blockMatches = findTextBlocksById(doc, anchor.blockId)
  const [block] = blockMatches

  if (!block) {
    return { status: 'invalid', reason: 'missing-block' }
  }

  if (blockMatches.length > 1) {
    return { status: 'invalid', reason: 'ambiguous-block-id' }
  }

  if (hasUnsupportedInlineContent(block.node)) {
    return { status: 'invalid', reason: 'unsupported-inline-content' }
  }

  const blockText = block.node.textContent

  if (
    anchor.endOffset <= blockText.length &&
    blockText.slice(anchor.startOffset, anchor.endOffset) === anchor.quote
  ) {
    return resolvedRange('valid', block.contentStart, anchor.startOffset, anchor.endOffset)
  }

  const matchingOffsets = findQuoteOffsets(blockText, anchor.quote)
  const [startOffset] = matchingOffsets

  if (startOffset === undefined) {
    return { status: 'invalid', reason: 'quote-not-found' }
  }

  if (matchingOffsets.length > 1) {
    return { status: 'invalid', reason: 'ambiguous-quote' }
  }

  return resolvedRange(
    'drifted',
    block.contentStart,
    startOffset,
    startOffset + anchor.quote.length,
  )
}

function findTextBlocksById(doc: ProseMirrorNode, blockId: string): BlockMatch[] {
  const matches: BlockMatch[] = []

  doc.descendants((node, position) => {
    if (node.isTextblock && nodeNeedsBlockId(node) && node.attrs.blockId === blockId) {
      matches.push({ node, contentStart: position + 1 })
      return false
    }
  })

  return matches
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

function findQuoteOffsets(blockText: string, quote: string): number[] {
  const offsets: number[] = []
  let offset = blockText.indexOf(quote)

  while (offset !== -1) {
    offsets.push(offset)
    offset = blockText.indexOf(quote, offset + 1)
  }

  return offsets
}

function resolvedRange(
  status: Exclude<SourceAnchorStatus, 'invalid'>,
  contentStart: number,
  startOffset: number,
  endOffset: number,
): ResolveSourceAnchorResult {
  return {
    status,
    from: contentStart + startOffset,
    to: contentStart + endOffset,
    startOffset,
    endOffset,
  }
}
