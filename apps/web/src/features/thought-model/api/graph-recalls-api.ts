import { ApiError, customFetch } from '@/api/http-client'
import { embeddingRequestHeaders } from './llm-settings'

export type GraphRagEmptyReason = 'no_confirmed_nodes' | 'no_similar_nodes' | 'no_anchored_blocks'

export interface GraphRagNodeHit {
  noteId: string
  noteTitle: string
  nodeId: string
  nodeType: string
  nodeText: string
  score: number
}

export interface GraphRagPassageHit {
  noteId: string
  noteTitle: string
  nodeId: string
  blockId: string
  text: string
  score: number
}

export interface GraphRagResult {
  nodes: GraphRagNodeHit[]
  hits: GraphRagPassageHit[]
  scopedBlockCount: number
  emptyReason: GraphRagEmptyReason | null
}

export interface GraphRagPayload {
  query?: string
  queryEmbedding?: number[]
  k?: number
  nodeK?: number
  noteIds?: string[]
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function recallGraphPassages(payload: GraphRagPayload): Promise<GraphRagResult> {
  const query = payload.query?.trim() ?? ''
  const hasQuery = query.length > 0
  const hasEmbedding = Array.isArray(payload.queryEmbedding) && payload.queryEmbedding.length > 0
  if (hasQuery === hasEmbedding) {
    throw new ApiError(400, payload, 'Graph recall needs exactly one of query or queryEmbedding')
  }
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/graph-recalls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...embeddingRequestHeaders() },
    body: JSON.stringify({
      ...(hasQuery ? { query } : { query_embedding: payload.queryEmbedding }),
      k: payload.k,
      node_k: payload.nodeK,
      note_ids: payload.noteIds ?? [],
    }),
  })
  return parseGraphRagResult(response.data)
}

function parseGraphRagResult(value: unknown): GraphRagResult {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.hits)) {
    throw new ApiError(502, value, 'Graph recall response format is invalid')
  }
  if ('thought_model' in value) {
    throw new ApiError(502, value, 'Graph recall must not return a ThoughtModel')
  }
  return {
    nodes: value.nodes.map((item) => parseNode(item)),
    hits: value.hits.map((item) => parseHit(item)),
    scopedBlockCount: readCount(value, 'scoped_block_count'),
    emptyReason: readEmptyReason(value.empty_reason),
  }
}

function parseNode(value: unknown): GraphRagNodeHit {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Graph recall node is invalid')
  }
  return {
    noteId: readString(value, 'note_id'),
    noteTitle: readString(value, 'note_title'),
    nodeId: readString(value, 'node_id'),
    nodeType: readString(value, 'node_type'),
    nodeText: readString(value, 'node_text'),
    score: readScore(value),
  }
}

function parseHit(value: unknown): GraphRagPassageHit {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Graph recall hit is invalid')
  }
  return {
    noteId: readString(value, 'note_id'),
    noteTitle: readString(value, 'note_title'),
    nodeId: readString(value, 'node_id'),
    blockId: readString(value, 'block_id'),
    text: readString(value, 'text'),
    score: readScore(value),
  }
}

function readEmptyReason(value: unknown): GraphRagEmptyReason | null {
  if (value == null) {
    return null
  }
  if (value === 'no_confirmed_nodes' || value === 'no_similar_nodes' || value === 'no_anchored_blocks') {
    return value
  }
  throw new ApiError(502, value, 'Graph recall empty_reason is invalid')
}

function readCount(record: Record<string, unknown>, key: string): number {
  const count = record[key]
  if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
    return count
  }
  return 0
}

function readScore(record: Record<string, unknown>): number {
  const score = record.score
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new ApiError(502, record, 'Graph recall missing score')
  }
  return score
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(502, record, `Graph recall missing ${key}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
