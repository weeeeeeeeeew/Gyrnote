import { ApiError, customFetch } from '@/api/http-client'

import type { CandidateThoughtModel } from '../domain/thought-model'

export interface CandidateCompilePayload {
  note_id: string
  source_revision: number
  title: string
  source_anchors: Array<{
    id: string
    quote: string
    block_id: string
  }>
  note_blocks: Array<{
    id: string
    text: string
  }>
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function compileCandidateModel(
  payload: CandidateCompilePayload,
): Promise<CandidateThoughtModel> {
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/candidates/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseCandidateThoughtModel(response.data)
}

export function parseCandidateThoughtModel(value: unknown): CandidateThoughtModel {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Candidate API response format is invalid')
  }

  const { id, note_id, source_revision, title, nodes, edges, proposed_anchors } = value
  if (
    typeof id !== 'string' ||
    typeof note_id !== 'string' ||
    typeof source_revision !== 'number' ||
    !Number.isInteger(source_revision) ||
    typeof title !== 'string' ||
    !Array.isArray(nodes) ||
    !Array.isArray(edges)
  ) {
    throw new ApiError(502, value, 'Candidate API response format is invalid')
  }

  const proposedAnchors = Array.isArray(proposed_anchors)
    ? proposed_anchors.map((anchor) => parseProposedAnchor(anchor, value))
    : []

  return {
    id,
    noteId: note_id,
    sourceRevision: source_revision,
    title,
    proposedAnchors,
    nodes: nodes.map((node) => parseCandidateNode(node, value)),
    edges: edges.map((edge) => parseCandidateEdge(edge, value)),
  }
}

function parseProposedAnchor(
  value: unknown,
  response: unknown,
): CandidateThoughtModel['proposedAnchors'][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.block_id !== 'string' ||
    typeof value.quote !== 'string' ||
    typeof value.start_offset !== 'number' ||
    typeof value.end_offset !== 'number' ||
    !Number.isInteger(value.start_offset) ||
    !Number.isInteger(value.end_offset)
  ) {
    throw new ApiError(502, response, 'Candidate API response format is invalid')
  }

  return {
    id: value.id,
    blockId: value.block_id,
    quote: value.quote,
    startOffset: value.start_offset,
    endOffset: value.end_offset,
  }
}

function parseCandidateNode(
  value: unknown,
  response: unknown,
): CandidateThoughtModel['nodes'][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.text !== 'string' ||
    !Array.isArray(value.source_anchor_ids) ||
    typeof value.confidence !== 'number'
  ) {
    throw new ApiError(502, response, 'Candidate API response format is invalid')
  }

  if (
    value.source_anchor_ids.length === 0 ||
    !value.source_anchor_ids.every((item) => typeof item === 'string')
  ) {
    throw new ApiError(502, response, 'Candidate API response format is invalid')
  }

  return {
    id: value.id,
    type: value.type as CandidateThoughtModel['nodes'][number]['type'],
    label: typeof value.label === 'string' ? value.label : null,
    text: value.text,
    sourceAnchorIds: value.source_anchor_ids,
    confidence: value.confidence,
  }
}

function parseCandidateEdge(
  value: unknown,
  response: unknown,
): CandidateThoughtModel['edges'][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.source_node_id !== 'string' ||
    typeof value.target_node_id !== 'string' ||
    typeof value.type !== 'string' ||
    !Array.isArray(value.source_anchor_ids) ||
    typeof value.confidence !== 'number'
  ) {
    throw new ApiError(502, response, 'Candidate API response format is invalid')
  }

  if (!value.source_anchor_ids.every((item) => typeof item === 'string')) {
    throw new ApiError(502, response, 'Candidate API response format is invalid')
  }

  return {
    id: value.id,
    sourceNodeId: value.source_node_id,
    targetNodeId: value.target_node_id,
    type: value.type as CandidateThoughtModel['edges'][number]['type'],
    label: typeof value.label === 'string' ? value.label : null,
    sourceAnchorIds: value.source_anchor_ids,
    confidence: value.confidence,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
