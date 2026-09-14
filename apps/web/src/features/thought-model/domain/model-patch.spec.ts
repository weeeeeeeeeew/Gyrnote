import { describe, expect, it } from 'vitest'

import { sampleThoughtModel } from '../fixtures/sample-thought-model'
import type { ThoughtModel, ThoughtNode } from './thought-model'
import {
  applyModelPatch,
  applyUpdateNodeTextOp,
  findNode,
  proposePatchFromAnchorStatuses,
  collectMoveAnchorOps,
  applyMoveAnchorOps,
  proposePatchFromAnchorResolutions,
  type ModelPatch,
} from './model-patch'

function patchWith(ops: ModelPatch['ops']): ModelPatch {
  return {
    id: 'patch-1',
    noteId: sampleThoughtModel.noteId,
    baseModelVersion: sampleThoughtModel.version,
    reason: 'test',
    ops,
  }
}

describe('applyModelPatch', () => {
  it('rejects an empty ops list', () => {
    const result = applyModelPatch(sampleThoughtModel, patchWith([]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/at least one op/)
    }
  })

  it('deletes a confirmed node and cascades edges without mutating input', () => {
    const before = structuredClone(sampleThoughtModel)
    const result = applyModelPatch(
      sampleThoughtModel,
      patchWith([{ op: 'delete_node', nodeId: 'claim-product-engineer' }]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model.nodes.some((node) => node.id === 'claim-product-engineer')).toBe(false)
      expect(
        result.model.edges.some(
          (edge) =>
            edge.sourceNodeId === 'claim-product-engineer' ||
            edge.targetNodeId === 'claim-product-engineer',
        ),
      ).toBe(false)
      expect(result.appliedOpCount).toBe(1)
    }
    expect(sampleThoughtModel).toEqual(before)
  })

  it('rejects deleting a locked node and leaves model unchanged on failure', () => {
    const locked = structuredClone(sampleThoughtModel)
    const target = locked.nodes.find((node) => node.id === 'claim-product-engineer')
    expect(target).toBeDefined()
    target!.reviewStatus = 'locked'

    const result = applyModelPatch(
      locked,
      patchWith([{ op: 'delete_node', nodeId: 'claim-product-engineer' }]),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('locked'))).toBe(true)
    }
  })
})

describe('applyUpdateNodeTextOp (user checkpoint)', () => {
  it('updates text and marks origin user_modified', () => {
    const result = applyUpdateNodeTextOp(sampleThoughtModel, {
      op: 'update_node_text',
      nodeId: 'question-direction',
      text: '  更新后的问题  ',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const node = findNode(result.model, 'question-direction')
      expect(node?.text).toBe('更新后的问题')
      expect(node?.origin).toBe('user_modified')
      expect(node?.reviewStatus).toBe(findNode(sampleThoughtModel, 'question-direction')?.reviewStatus)
    }
  })

  it('rejects missing node, blank text, and locked nodes', () => {
    expect(
      applyUpdateNodeTextOp(sampleThoughtModel, {
        op: 'update_node_text',
        nodeId: 'missing',
        text: 'x',
      }).ok,
    ).toBe(false)

    expect(
      applyUpdateNodeTextOp(sampleThoughtModel, {
        op: 'update_node_text',
        nodeId: 'question-direction',
        text: '   ',
      }).ok,
    ).toBe(false)

    const locked = structuredClone(sampleThoughtModel)
    locked.nodes.find((node) => node.id === 'question-direction')!.reviewStatus = 'locked'
    expect(
      applyUpdateNodeTextOp(locked, {
        op: 'update_node_text',
        nodeId: 'question-direction',
        text: '不允许',
      }).ok,
    ).toBe(false)
  })

  it('is used by applyModelPatch for update_node_text ops', () => {
    const result = applyModelPatch(
      sampleThoughtModel,
      patchWith([
        {
          op: 'update_node_text',
          nodeId: 'question-direction',
          text: 'patch 后的标题',
        },
      ]),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(findNode(result.model, 'question-direction')?.text).toBe('patch 后的标题')
    }
  })
})

describe('proposePatchFromAnchorStatuses (user checkpoint)', () => {
  it('proposes delete_node only for nodes whose every bound anchor is invalid or missing', () => {
    const model = modelWithMixedAnchors()
    const before = structuredClone(model)
    const result = proposePatchFromAnchorStatuses(model, {
      'a-drift': 'drifted',
      'a-gone': 'invalid',
      'a-locked-gone': 'invalid',
      'a-ok': 'valid',
      'a-dead': 'invalid',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch.ops).toEqual([{ op: 'delete_node', nodeId: 'drop-invalid' }])
      expect(result.patch.id).not.toBe(model.id)
      expect(result.patch.noteId).toBe(model.noteId)
      expect(result.patch.baseModelVersion).toBe(model.version)
      expect(result.patch.reason).toMatch(/锚点失效|invalid/)
      expect(result.patch.ops.every((op) => op.op === 'delete_node')).toBe(true)
      expect(
        result.patch.ops.some((op) => op.op === 'delete_node' && op.nodeId === 'unbound'),
      ).toBe(false)
    }
    expect(model).toEqual(before)
  })

  it('skips locked nodes even when their anchors are invalid', () => {
    const model: ThoughtModel = {
      ...modelWithMixedAnchors(),
      nodes: [
        node({
          id: 'skip-locked',
          sourceAnchorIds: ['a-locked-gone'],
          reviewStatus: 'locked',
        }),
      ],
    }

    const result = proposePatchFromAnchorStatuses(model, { 'a-locked-gone': 'invalid' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/没有|no /i)
    }
  })

  it('preserves locked nodes at rate 1 under propose and apply', () => {
    const model = modelWithMixedAnchors()
    const lockedIds = model.nodes.filter((item) => item.reviewStatus === 'locked').map((item) => item.id)
    expect(lockedIds.length).toBeGreaterThan(0)

    const proposed = proposePatchFromAnchorStatuses(model, {
      'a-drift': 'invalid',
      'a-gone': 'invalid',
      'a-locked-gone': 'invalid',
      'a-ok': 'invalid',
      'a-dead': 'invalid',
    })
    const proposedDeletes = proposed.ok
      ? proposed.patch.ops.filter((op) => op.op === 'delete_node').map((op) => op.nodeId)
      : []

    const applyResults = lockedIds.map((nodeId) => applyModelPatch(model, patchWith([{ op: 'delete_node', nodeId }])))
    const preserved =
      lockedIds.filter((nodeId) => !proposedDeletes.includes(nodeId)).length +
      applyResults.filter((result) => !result.ok).length

    // propose skip + apply reject, both counted; rate is 1 when every locked node is untouched.
    expect(preserved / (lockedIds.length * 2)).toBe(1)
    expect(applyResults.every((result) => !result.ok)).toBe(true)
    expect(model.nodes.filter((item) => item.reviewStatus === 'locked').map((item) => item.id)).toEqual(lockedIds)
  })

  it('keeps a node when any of its anchors is still valid or drifted', () => {
    const model: ThoughtModel = {
      ...modelWithMixedAnchors(),
      nodes: [
        node({
          id: 'keep-partial',
          sourceAnchorIds: ['a-ok', 'a-dead'],
        }),
      ],
    }

    const result = proposePatchFromAnchorStatuses(model, {
      'a-ok': 'valid',
      'a-dead': 'invalid',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toMatch(/没有|no /i)
    }
  })
})

function modelWithMixedAnchors(): ThoughtModel {
  return {
    id: 'model-anchor-mix',
    noteId: 'note-anchor-mix',
    version: 4,
    title: '松耦合样例',
    nodes: [
      node({
        id: 'keep-drifted',
        sourceAnchorIds: ['a-drift'],
      }),
      node({
        id: 'drop-invalid',
        sourceAnchorIds: ['a-gone'],
      }),
      node({
        id: 'skip-locked',
        sourceAnchorIds: ['a-locked-gone'],
        reviewStatus: 'locked',
      }),
      node({
        id: 'unbound',
        sourceAnchorIds: [],
      }),
      node({
        id: 'keep-partial',
        sourceAnchorIds: ['a-ok', 'a-dead'],
      }),
    ],
    edges: [],
  }
}

function node(overrides: Partial<ThoughtNode> & Pick<ThoughtNode, 'id'>): ThoughtNode {
  return {
    type: 'claim',
    label: null,
    text: overrides.id,
    origin: 'user_created',
    explicitness: 'explicit',
    reviewStatus: 'confirmed',
    confidence: null,
    sourceAnchorIds: [],
    ...overrides,
  }
}

describe('applyMoveAnchorOps', () => {
  it('updates offsets without changing quote and without mutating input', () => {
    const anchors = [identified('a-drift', 0, 4)]
    const before = structuredClone(anchors)
    const result = applyMoveAnchorOps(anchors, [
      { op: 'move_anchor', anchorId: 'a-drift', startOffset: 6, endOffset: 10 },
    ])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.anchors[0]).toMatchObject({
        id: 'a-drift',
        startOffset: 6,
        endOffset: 10,
        quote: 'abcd',
        blockId: 'block-a',
      })
    }
    expect(anchors).toEqual(before)
  })

  it('rejects a missing anchor id', () => {
    const result = applyMoveAnchorOps([identified('a-drift')], [
      { op: 'move_anchor', anchorId: 'missing', startOffset: 1, endOffset: 2 },
    ])
    expect(result.ok).toBe(false)
  })
})

describe('collectMoveAnchorOps (user checkpoint)', () => {
  it('emits move_anchor for drifted evidence with a new range', () => {
    const model = modelWithMixedAnchors()
    const anchors = [identified('a-drift', 0, 4)]
    const ops = collectMoveAnchorOps(model, anchors, {
      'a-drift': { status: 'drifted', startOffset: 6, endOffset: 10 },
    })

    expect(ops).toEqual([
      { op: 'move_anchor', anchorId: 'a-drift', startOffset: 6, endOffset: 10 },
    ])
  })

  it('skips locked nodes, valid/invalid statuses, and unchanged offsets', () => {
    const model = modelWithMixedAnchors()
    const anchors = [
      identified('a-drift', 0, 4),
      identified('a-locked-gone', 0, 4),
      identified('a-ok', 0, 4),
    ]
    const ops = collectMoveAnchorOps(model, anchors, {
      'a-drift': { status: 'drifted', startOffset: 6, endOffset: 10 },
      'a-locked-gone': { status: 'drifted', startOffset: 8, endOffset: 12 },
      'a-ok': { status: 'valid' },
      'a-gone': { status: 'invalid' },
    })

    expect(ops).toEqual([
      { op: 'move_anchor', anchorId: 'a-drift', startOffset: 6, endOffset: 10 },
    ])
    expect(ops.some((op) => op.anchorId === 'a-locked-gone')).toBe(false)
  })

  it('is merged into proposePatchFromAnchorResolutions without deleting drifted nodes', () => {
    const model: ThoughtModel = {
      ...modelWithMixedAnchors(),
      nodes: [node({ id: 'keep-drifted', sourceAnchorIds: ['a-drift'] })],
    }
    const anchors = [identified('a-drift', 0, 4)]
    const result = proposePatchFromAnchorResolutions(
      model,
      { 'a-drift': { status: 'drifted', startOffset: 6, endOffset: 10 } },
      anchors,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch.ops).toEqual([
        { op: 'move_anchor', anchorId: 'a-drift', startOffset: 6, endOffset: 10 },
      ])
      expect(result.patch.id).not.toBe(model.id)
    }
  })

  it('treats startOffset 0 as a legal drifted range', () => {
    const model: ThoughtModel = {
      ...modelWithMixedAnchors(),
      nodes: [node({ id: 'keep-drifted', sourceAnchorIds: ['a-drift'] })],
    }
    const ops = collectMoveAnchorOps(model, [identified('a-drift', 2, 6)], {
      'a-drift': { status: 'drifted', startOffset: 0, endOffset: 4 },
    })

    expect(ops).toEqual([
      { op: 'move_anchor', anchorId: 'a-drift', startOffset: 0, endOffset: 4 },
    ])
  })
})

function identified(
  id: string,
  startOffset = 0,
  endOffset = 4,
): import('@/features/source-anchors/domain/source-anchor').IdentifiedSourceAnchor {
  return {
    id,
    blockId: 'block-a',
    startOffset,
    endOffset,
    quote: 'abcd',
    quoteHash: 'hash-abcd',
  }
}
