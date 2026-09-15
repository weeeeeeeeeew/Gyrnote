import type { JSONContent } from '@tiptap/core'

import type { IdentifiedSourceAnchor } from '@/features/source-anchors/domain/source-anchor'
import type {
  GraphEdgePathStyle,
  GraphNodePosition,
} from '@/features/thought-model/adapters/vue-flow'
import type {
  ThoughtEdge,
  ThoughtModel,
  ThoughtNode,
  ThoughtOrigin,
  ThoughtExplicitness,
  ThoughtReviewStatus,
  ThoughtNodeType,
  ThoughtEdgeType,
} from '@/features/thought-model/domain/thought-model'

export interface NoteVersionSaveInput {
  title: string
  contentJson: JSONContent
  sourceAnchors: readonly IdentifiedSourceAnchor[]
  thoughtModel: ThoughtModel
  graphLayout: {
    nodePositions: Readonly<Record<string, GraphNodePosition>>
    edgePathStyle: GraphEdgePathStyle
  }
  expectedRevision: number
}

export interface PersistedThoughtModelPayload {
  id: string
  note_id?: string
  version: number
  title: string
  nodes: Array<{
    id: string
    type: string
    label: string | null
    text: string
    origin: string
    explicitness: string
    review_status: string
    confidence: number | null
    source_anchor_ids: string[]
  }>
  edges: Array<{
    id: string
    source_node_id: string
    target_node_id: string
    type: string
    label: string | null
    origin: string
    explicitness: string
    review_status: string
    confidence: number | null
  }>
}

export interface PersistedGraphLayoutPayload {
  node_positions: Record<string, { x: number; y: number }>
  edge_path_style: GraphEdgePathStyle
}

export interface NoteCreatePayload {
  title: string
  content_json: Record<string, unknown>
  source_anchors: Array<{
    id: string
    block_id: string
    start_offset: number
    end_offset: number
    quote: string
    quote_hash: string
  }>
  thought_model: PersistedThoughtModelPayload
  graph_layout: PersistedGraphLayoutPayload
}

export interface NoteVersionCreatePayload extends NoteCreatePayload {
  expected_revision: number
}

export function toNoteCreatePayload(input: NoteVersionSaveInput): NoteCreatePayload {
  const title = input.title.trim()
  if (!title) {
    throw new Error('note title is required')
  }

  const contentJson = cloneCanonicalTiptapJson(input.contentJson)

  return {
    title,
    content_json: contentJson,
    source_anchors: input.sourceAnchors.map(toSourceAnchorPayload),
    thought_model: toPersistedThoughtModelPayload(input.thoughtModel, title),
    graph_layout: toPersistedGraphLayout({
      nodePositions: input.graphLayout.nodePositions,
      edgePathStyle: input.graphLayout.edgePathStyle,
      knownNodeIds: input.thoughtModel.nodes.map((node) => node.id),
    }),
  }
}

export function toNoteVersionCreatePayload(
  input: NoteVersionSaveInput,
): NoteVersionCreatePayload {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new Error('expectedRevision must be a positive integer')
  }

  return {
    ...toNoteCreatePayload(input),
    expected_revision: input.expectedRevision,
  }
}

export function toPersistedThoughtModelPayload(
  model: ThoughtModel,
  titleOverride?: string,
): PersistedThoughtModelPayload {
  const noteId = model.noteId.trim()
  return {
    id: model.id,
    ...(noteId ? { note_id: noteId } : {}),
    version: model.version,
    title: (titleOverride ?? model.title).trim(),
    nodes: model.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      text: node.text,
      origin: node.origin,
      explicitness: node.explicitness,
      review_status: node.reviewStatus,
      confidence: node.confidence,
      source_anchor_ids: [...node.sourceAnchorIds],
    })),
    edges: model.edges.map((edge) => ({
      id: edge.id,
      source_node_id: edge.sourceNodeId,
      target_node_id: edge.targetNodeId,
      type: edge.type,
      label: edge.label,
      origin: edge.origin,
      explicitness: edge.explicitness,
      review_status: edge.reviewStatus,
      confidence: edge.confidence,
    })),
  }
}

export function fromPersistedThoughtModelPayload(
  payload: PersistedThoughtModelPayload,
): ThoughtModel {
  return {
    id: payload.id,
    noteId: payload.note_id ?? '',
    version: payload.version,
    title: payload.title,
    nodes: payload.nodes.map(fromPersistedNode),
    edges: payload.edges.map(fromPersistedEdge),
  }
}

/**
 * Persist view layout only. Must not invent positions for unknown nodes.
 *
 * User checkpoint — implement:
 * 1. keep only keys present in `knownNodeIds`
 * 2. drop entries whose x/y are not finite numbers
 * 3. return `edge_path_style` from input unchanged
 */
export function toPersistedGraphLayout(input: {
  nodePositions: Readonly<Record<string, GraphNodePosition>>
  edgePathStyle: GraphEdgePathStyle
  knownNodeIds: readonly string[]
}): PersistedGraphLayoutPayload {
  const nodePositions = Object.fromEntries(
    Object.entries(input.nodePositions).filter(([nodeId, position]) => input.knownNodeIds.includes(nodeId) && Number.isFinite(position.x) && Number.isFinite(position.y)),
  )

  return { node_positions: nodePositions, edge_path_style: input.edgePathStyle }
}

export function fromPersistedGraphLayout(payload: PersistedGraphLayoutPayload): {
  nodePositions: Record<string, GraphNodePosition>
  edgePathStyle: GraphEdgePathStyle
} {
  const nodePositions: Record<string, GraphNodePosition> = {}
  for (const [nodeId, position] of Object.entries(payload.node_positions)) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      continue
    }
    nodePositions[nodeId] = { x: position.x, y: position.y }
  }

  return {
    nodePositions,
    edgePathStyle: payload.edge_path_style,
  }
}

function fromPersistedNode(node: PersistedThoughtModelPayload['nodes'][number]): ThoughtNode {
  return {
    id: node.id,
    type: node.type as ThoughtNodeType,
    label: node.label,
    text: node.text,
    origin: node.origin as ThoughtOrigin,
    explicitness: node.explicitness as ThoughtExplicitness,
    reviewStatus: node.review_status as ThoughtReviewStatus,
    confidence: node.confidence,
    sourceAnchorIds: [...node.source_anchor_ids],
  }
}

function fromPersistedEdge(edge: PersistedThoughtModelPayload['edges'][number]): ThoughtEdge {
  return {
    id: edge.id,
    sourceNodeId: edge.source_node_id,
    targetNodeId: edge.target_node_id,
    type: edge.type as ThoughtEdgeType,
    label: edge.label,
    origin: edge.origin as ThoughtOrigin,
    explicitness: edge.explicitness as ThoughtExplicitness,
    reviewStatus: edge.review_status as ThoughtReviewStatus,
    confidence: edge.confidence,
  }
}

function toSourceAnchorPayload(anchor: IdentifiedSourceAnchor) {
  if (!isUuid(anchor.id)) {
    throw new Error(`source anchor id must be a UUID: ${anchor.id}`)
  }

  return {
    id: anchor.id,
    block_id: anchor.blockId,
    start_offset: anchor.startOffset,
    end_offset: anchor.endOffset,
    quote: anchor.quote,
    quote_hash: anchor.quoteHash,
  }
}

function cloneCanonicalTiptapJson(content: JSONContent): Record<string, unknown> {
  const cloned: unknown = JSON.parse(JSON.stringify(content))
  if (!isRecord(cloned) || cloned.type !== 'doc') {
    throw new Error('contentJson must be a Tiptap doc')
  }

  return cloned
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuid(value: string): boolean {
  // RFC 4122 / 9562: backend note and anchor ids are uuid7, not only versions 1–5.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}
