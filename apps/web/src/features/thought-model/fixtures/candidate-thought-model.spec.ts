import { describe, expect, it } from 'vitest'

import { hashSourceQuote } from '@/features/source-anchors/domain/quote-hash'

import { buildFixtureCandidate } from './candidate-thought-model'

describe('buildFixtureCandidate', () => {
  it('creates only suggested candidate data anchored to the supplied source snapshot', () => {
    const candidate = buildFixtureCandidate('note-1', 3, [
      {
        id: 'anchor-1',
        blockId: 'block-1',
        startOffset: 0,
        endOffset: 4,
        quote: '原文片段',
        quoteHash: hashSourceQuote('原文片段'),
      },
    ])

    expect(candidate.sourceRevision).toBe(3)
    expect(candidate.nodes).toHaveLength(2)
    expect(candidate.nodes[0]).toMatchObject({ sourceAnchorIds: ['anchor-1'], confidence: 0.72 })
    expect(candidate.nodes[0]?.text).toBe('原文片段')
    expect(candidate.nodes[1]).toMatchObject({
      id: 'candidate-claim-1',
      type: 'claim',
      sourceAnchorIds: ['anchor-1'],
    })
    expect(candidate.edges).toEqual([
      {
        id: 'candidate-edge-supports-1',
        sourceNodeId: 'candidate-observation-1',
        targetNodeId: 'candidate-claim-1',
        type: 'supports',
        sourceAnchorIds: ['anchor-1'],
        confidence: 0.6,
      },
    ])
  })

  it('returns an empty candidate when no anchors are available', () => {
    expect(buildFixtureCandidate('note-1', 1, [])).toMatchObject({ nodes: [], edges: [] })
  })
})
