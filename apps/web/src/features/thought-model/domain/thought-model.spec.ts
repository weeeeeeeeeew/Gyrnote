import { describe, expect, it } from 'vitest'

import {
  THOUGHT_NODE_TYPES,
  createBlankThoughtModel,
  isCandidateThoughtNode,
  isThoughtNodeType,
  resolveCustomLabel,
  toConfirmedThoughtEdge,
  toConfirmedThoughtNode,
} from './thought-model'
import type { CandidateThoughtEdge, CandidateThoughtNode } from './thought-model'

describe('isThoughtNodeType', () => {
  it('creates an empty confirmed model without covering the note', () => {
    const model = createBlankThoughtModel('空白笔记')
    expect(model.nodes).toEqual([])
    expect(model.edges).toEqual([])
    expect(model.title).toBe('空白笔记')
  })

  it.each(THOUGHT_NODE_TYPES)('accepts the supported node type %s', (nodeType) => {
    expect(isThoughtNodeType(nodeType)).toBe(true)
  })

  it.each(['idea', '', 1, null, undefined, {}, ['claim']])(
    'rejects unsupported input: %j',
    (value) => {
      expect(isThoughtNodeType(value)).toBe(false)
    },
  )
})

describe('toConfirmedThoughtNode', () => {
  it('maps a candidate node into a confirmed ThoughtNode without dropping the source anchors', () => {
    const candidate: CandidateThoughtNode = {
      id: 'candidate-observation-1',
      type: 'observation',
      text: '原文片段',
      sourceAnchorIds: ['anchor-1', 'anchor-2'],
      confidence: 0.72,
    }

    expect(toConfirmedThoughtNode(candidate)).toEqual({
      id: 'candidate-observation-1',
      type: 'observation',
      label: null,
      text: '原文片段',
      origin: 'ai_created',
      explicitness: 'inferred',
      reviewStatus: 'confirmed',
      confidence: 0.72,
      sourceAnchorIds: ['anchor-1', 'anchor-2'],
    })
  })
})

describe('toConfirmedThoughtEdge', () => {
  it('maps a candidate edge into a confirmed ThoughtEdge without writing sourceAnchorIds', () => {
    const candidate: CandidateThoughtEdge = {
      id: 'candidate-edge-1',
      sourceNodeId: 'candidate-observation-1',
      targetNodeId: 'candidate-claim-1',
      type: 'supports',
      sourceAnchorIds: ['anchor-1'],
      confidence: 0.6,
    }

    expect(toConfirmedThoughtEdge(candidate)).toEqual({
      id: 'candidate-edge-1',
      sourceNodeId: 'candidate-observation-1',
      targetNodeId: 'candidate-claim-1',
      type: 'supports',
      label: null,
      origin: 'ai_created',
      explicitness: 'inferred',
      reviewStatus: 'confirmed',
      confidence: 0.6,
    })
  })
})

describe('resolveCustomLabel (#4 learning checkpoint)', () => {
  it('returns null for non-custom types even when a label is provided', () => {
    expect(resolveCustomLabel('claim', '忽略我')).toBeNull()
    expect(resolveCustomLabel('supports', '忽略我')).toBeNull()
  })

  it('trims and keeps a non-empty custom label', () => {
    expect(resolveCustomLabel('custom', '  类比关系  ')).toBe('类比关系')
  })

  it('returns null for blank custom labels', () => {
    expect(resolveCustomLabel('custom', '   ')).toBeNull()
    expect(resolveCustomLabel('custom', null)).toBeNull()
    expect(resolveCustomLabel('custom', undefined)).toBeNull()
  })
})

describe('isCandidateThoughtNode (M3 learning checkpoint)', () => {
  it('accepts a structurally valid candidate node', () => {
    expect(
      isCandidateThoughtNode({
        id: 'candidate-1',
        type: 'observation',
        text: '原文片段',
        sourceAnchorIds: ['anchor-1'],
        confidence: 0.72,
      }),
    ).toBe(true)
  })

  it.each([
    null,
    {},
    { id: 'x', type: 'not-supported', text: 'x', sourceAnchorIds: ['a'], confidence: 0.5 },
    { id: 'x', type: 'claim', text: 'x', sourceAnchorIds: [], confidence: 0.5 },
    { id: 'x', type: 'claim', text: 'x', sourceAnchorIds: [''], confidence: 0.5 },
    { id: 'x', type: 'claim', text: 'x', sourceAnchorIds: ['a'], confidence: 1.1 },
  ])('rejects invalid candidate node: %j', (value) => {
    expect(isCandidateThoughtNode(value)).toBe(false)
  })
})
