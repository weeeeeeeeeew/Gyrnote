export type SourceAnchorStatus = 'valid' | 'drifted' | 'invalid'

export interface SourceAnchor {
  blockId: string
  startOffset: number
  endOffset: number
  quote: string
  quoteHash: string
}

export interface IdentifiedSourceAnchor extends SourceAnchor {
  id: string
}

export interface CreateSourceAnchorInput {
  blockId: string
  blockText: string
  startOffset: number
  endOffset: number
}

export type QuoteHasher = (quote: string) => string

export function createSourceAnchor(
  input: CreateSourceAnchorInput,
  hashQuote: QuoteHasher,
): SourceAnchor {
  // M2.3 learning checkpoint: validate one block-local range and derive quote + quoteHash.
  if (!input.blockId.trim()) {
    throw new Error('blockId is required')
  }
  if (!Number.isInteger(input.startOffset) || !Number.isInteger(input.endOffset)) {
    throw new Error('startOffset and endOffset must be integers')
  }
  if (input.startOffset < 0 || input.endOffset > input.blockText.length || input.startOffset >= input.endOffset) {
    throw new Error('startOffset must be between 0 and endOffset, and endOffset must be between startOffset and blockText.length')
  }
  const quote = input.blockText.slice(input.startOffset, input.endOffset)
  const quoteHash = hashQuote(quote)
  return {
    blockId: input.blockId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    quote,
    quoteHash,
  }
}
