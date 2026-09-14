import type { IdentifiedSourceAnchor } from '@/features/source-anchors/domain/source-anchor'

import type { ThoughtModel, ThoughtNode } from './thought-model'

export type ModelPatchOp =
  | {
      op: 'update_node_text'
      nodeId: string
      text: string
    }
  | {
      op: 'delete_node'
      nodeId: string
    }
  | {
      op: 'move_anchor'
      anchorId: string
      startOffset: number
      endOffset: number
    }

export interface ModelPatch {
  id: string
  noteId: string
  /** Confirmed model.version this patch was computed against. */
  baseModelVersion: number
  reason: string
  ops: ModelPatchOp[]
}

export type ApplyModelPatchResult =
  | { ok: true; model: ThoughtModel; appliedOpCount: number }
  | { ok: false; errors: string[] }

/** Resolved against the current note; drifted is still reusable evidence. */
export type ModelPatchAnchorStatus = 'valid' | 'drifted' | 'invalid'

export type ModelPatchAnchorStatusMap = Readonly<Record<string, ModelPatchAnchorStatus>>

/** Drifted should carry the new block-local range from resolveSourceAnchor. */
export type ModelPatchAnchorResolution =
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'drifted'; startOffset?: number; endOffset?: number }

export type ModelPatchAnchorResolutionMap = Readonly<Record<string, ModelPatchAnchorResolution>>

export type ProposeModelPatchResult =
  | { ok: true; patch: ModelPatch }
  | { ok: false; reason: string }

export type ApplyMoveAnchorOpsResult =
  | { ok: true; anchors: IdentifiedSourceAnchor[] }
  | { ok: false; error: string }

/**
 * Apply a candidate ModelPatch to a confirmed ThoughtModel.
 * All-or-nothing: any invalid op rejects the whole patch.
 * Never mutates the input model.
 */
export function applyModelPatch(model: ThoughtModel, patch: ModelPatch): ApplyModelPatchResult {
  if (patch.ops.length === 0) {
    return { ok: false, errors: ['patch must contain at least one op'] }
  }

  // JSON clone: Pinia refs / proxies are not structuredClone-safe.
  let next = cloneThoughtModel(model)
  const errors: string[] = []

  for (const [index, op] of patch.ops.entries()) {
    const step = applyOneOp(next, op)
    if (!step.ok) {
      errors.push(`ops[${index}] ${op.op}: ${step.error}`)
      continue
    }
    next = step.model
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    model: next,
    appliedOpCount: patch.ops.length,
  }
}

type OpStepResult = { ok: true; model: ThoughtModel } | { ok: false; error: string }

function applyOneOp(model: ThoughtModel, op: ModelPatchOp): OpStepResult {
  switch (op.op) {
    case 'update_node_text':
      return applyUpdateNodeTextOp(model, op)
    case 'delete_node':
      return applyDeleteNodeOp(model, op)
    case 'move_anchor':
      // SourceAnchor lives beside the model; store applies these via applyMoveAnchorOps.
      return { ok: true, model }
  }
}

/**
 * User checkpoint — implement update_node_text against a cloned model:
 * - missing nodeId → fail
 * - blank / whitespace-only text → fail
 * - reviewStatus === 'locked' → fail (do not mutate)
 * - otherwise set text (trimmed), origin = 'user_modified', keep other fields
 */
export function applyUpdateNodeTextOp(
  _model: ThoughtModel,
  _op: Extract<ModelPatchOp, { op: 'update_node_text' }>,
): OpStepResult {
  const node = _model.nodes.find((item) => item.id === _op.nodeId)
  if (!node) {
    return { ok: false, error: `node not found: ${_op.nodeId}` }
  }
  if (node.reviewStatus === 'locked') {
    return { ok: false, error: `node is locked: ${_op.nodeId}` }
  }
  if (_op.text.trim() === '') {
    return { ok: false, error: `text is blank: ${_op.nodeId}` }
  }
  return { ok: true, model: {
    ..._model,
    nodes: _model.nodes.map((item) => item.id === _op.nodeId ? { ...item, text: _op.text.trim(), origin: 'user_modified' } : item),
  } }
}

function applyDeleteNodeOp(
  model: ThoughtModel,
  op: Extract<ModelPatchOp, { op: 'delete_node' }>,
): OpStepResult {
  const node = model.nodes.find((item) => item.id === op.nodeId)
  if (!node) {
    return { ok: false, error: `node not found: ${op.nodeId}` }
  }
  if (node.reviewStatus === 'locked') {
    return { ok: false, error: `node is locked: ${op.nodeId}` }
  }

  return {
    ok: true,
    model: {
      ...model,
      nodes: model.nodes.filter((item) => item.id !== op.nodeId),
      edges: model.edges.filter(
        (edge) => edge.sourceNodeId !== op.nodeId && edge.targetNodeId !== op.nodeId,
      ),
    },
  }
}

/**
 * User checkpoint — propose a candidate ModelPatch from confirmed nodes vs anchor statuses.
 *
 * Product: graph and note are loosely coupled (意合而不形合). Do not add nodes
 * for uncovered note text. Never auto-apply; caller puts the result on pendingPatch.
 *
 * Rules:
 * - empty sourceAnchorIds → skip (unbound is allowed)
 * - any bound anchor is valid or drifted → keep (drifted ≠ delete)
 * - every bound anchor is invalid or missing from the map → delete_node
 * - reviewStatus === 'locked' → skip (do not emit an op that apply would reject)
 * - no deletions → { ok: false, reason } (do not return empty ops)
 * - ops follow model.nodes order; only delete_node
 */
export function proposePatchFromAnchorStatuses(
  _model: ThoughtModel,
  _statuses: ModelPatchAnchorStatusMap,
): ProposeModelPatchResult {
  const ops: ModelPatchOp[] = []

  for (const node of _model.nodes) {
    if (node.reviewStatus === 'locked') {
      continue
    }

    if (node.sourceAnchorIds.length === 0) {
      continue
    }
    let isInvalid = node.sourceAnchorIds.every((anchorId) => _statuses[anchorId] !== 'valid' && _statuses[anchorId] !== 'drifted')
    if (isInvalid) {
      ops.push({ op: 'delete_node', nodeId: node.id })
    }
  }
  if (ops.length === 0) {
    return { ok: false, reason: 'no deletions' }
  }
  return { ok: true, patch: {
    id: `anchor-patch-${_model.id}`,
    noteId: _model.noteId,
    baseModelVersion: _model.version,
    reason: '锚点失效：建议删除证据完全丢失的节点',
    ops,
  } }
}

/**
 * Merge deletion proposals with MoveAnchor ops. Does not rewrite the user's
 * delete classifier. Empty combined ops → { ok: false }.
 */
export function proposePatchFromAnchorResolutions(
  model: ThoughtModel,
  resolutions: ModelPatchAnchorResolutionMap,
  anchors: readonly IdentifiedSourceAnchor[] = [],
): ProposeModelPatchResult {
  const statuses: Record<string, ModelPatchAnchorStatus> = {}
  for (const [anchorId, resolution] of Object.entries(resolutions)) {
    statuses[anchorId] = resolution.status
  }

  const deletion = proposePatchFromAnchorStatuses(model, statuses)
  const moves = collectMoveAnchorOps(model, anchors, resolutions)
  const ops: ModelPatchOp[] = [...(deletion.ok ? deletion.patch.ops : []), ...moves]

  if (ops.length === 0) {
    return { ok: false, reason: deletion.ok ? 'no operations' : deletion.reason }
  }

  return {
    ok: true,
    patch: {
      id: `anchor-patch-${model.id}`,
      noteId: model.noteId,
      baseModelVersion: model.version,
      reason: deletion.ok
        ? `${deletion.patch.reason}；可复用证据按漂移迁移`
        : '锚点漂移：建议迁移仍可定位的证据',
      ops,
    },
  }
}

/**
 * User checkpoint — emit move_anchor ops for drifted evidence (not deletes).
 *
 * - locked node → skip its anchors
 * - resolution.status !== 'drifted' → skip
 * - missing startOffset/endOffset / non-integer / start>=end / start<0 → skip
 * - unknown anchorId (not in `anchors`) → skip
 * - offsets already equal to the current anchor → skip
 * - otherwise one move_anchor per anchorId (model.nodes then sourceAnchorIds order)
 * - never emit delete_node here
 */
export function collectMoveAnchorOps(
  _model: ThoughtModel,
  _anchors: readonly IdentifiedSourceAnchor[],
  _resolutions: ModelPatchAnchorResolutionMap,
): Array<Extract<ModelPatchOp, { op: 'move_anchor' }>> {
  const ops: Array<Extract<ModelPatchOp, { op: 'move_anchor' }>> = []

  for (const node of _model.nodes) {
    if (node.reviewStatus === 'locked') {
      continue
    }
    if (node.sourceAnchorIds.length === 0) {
      continue
    }
    
    for (const anchorId of node.sourceAnchorIds) {
      const anchor = _anchors.find((a) => a.id === anchorId)
      if (!anchor) continue

      const resolution = _resolutions[anchorId]
      if (!resolution || resolution.status !== 'drifted') {
        continue
      }
      const { startOffset, endOffset } = resolution
      if (startOffset === undefined || endOffset === undefined) {
        continue
      }
      if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
        continue
      }
      if (startOffset === anchor.startOffset && endOffset === anchor.endOffset) {
        continue
      }
      if (startOffset >= endOffset || startOffset < 0) {
        continue
      }
      ops.push({ op: 'move_anchor', anchorId, startOffset, endOffset })
    }
  }
  return ops
}

export function applyMoveAnchorOps(
  anchors: readonly IdentifiedSourceAnchor[],
  ops: readonly Extract<ModelPatchOp, { op: 'move_anchor' }>[],
): ApplyMoveAnchorOpsResult {
  if (ops.length === 0) {
    return { ok: true, anchors: anchors.map((anchor) => ({ ...anchor })) }
  }

  let next = anchors.map((anchor) => ({ ...anchor }))
  for (const op of ops) {
    const step = applyMoveAnchorOp(next, op)
    if (!step.ok) {
      return step
    }
    next = step.anchors
  }
  return { ok: true, anchors: next }
}

function applyMoveAnchorOp(
  anchors: readonly IdentifiedSourceAnchor[],
  op: Extract<ModelPatchOp, { op: 'move_anchor' }>,
): ApplyMoveAnchorOpsResult {
  const current = anchors.find((anchor) => anchor.id === op.anchorId)
  if (!current) {
    return { ok: false, error: `anchor not found: ${op.anchorId}` }
  }
  if (
    !Number.isInteger(op.startOffset) ||
    !Number.isInteger(op.endOffset) ||
    op.startOffset < 0 ||
    op.startOffset >= op.endOffset
  ) {
    return { ok: false, error: `invalid range: ${op.anchorId}` }
  }

  return {
    ok: true,
    anchors: anchors.map((anchor) =>
      anchor.id === op.anchorId
        ? { ...anchor, startOffset: op.startOffset, endOffset: op.endOffset }
        : anchor,
    ),
  }
}

/** Test helper: locate a node without asserting domain invariants. */
export function findNode(model: ThoughtModel, nodeId: string): ThoughtNode | undefined {
  return model.nodes.find((node) => node.id === nodeId)
}

function cloneThoughtModel(model: ThoughtModel): ThoughtModel {
  return JSON.parse(JSON.stringify(model)) as ThoughtModel
}
