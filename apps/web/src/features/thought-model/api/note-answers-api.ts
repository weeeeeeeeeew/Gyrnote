import { ApiError, customFetch } from '@/api/http-client'
import type { GraphRagEmptyReason, GraphRagNodeHit, GraphRagPassageHit } from './graph-recalls-api'
import { embeddingRequestHeaders, llmRequestHeaders } from './llm-settings'

export type NoteAnswerRefuseReason = GraphRagEmptyReason | 'no_passages' | 'insufficient_evidence'

export interface NoteAnswerResult {
  answer: string
  grounded: boolean
  refuseReason: NoteAnswerRefuseReason | null
  citedBlockIds: string[]
  nodes: GraphRagNodeHit[]
  hits: GraphRagPassageHit[]
}

export interface NoteAnswerTurnPayload {
  role: 'user' | 'assistant'
  content: string
}

export interface NoteAnswerPayload {
  query: string
  k?: number
  nodeK?: number
  noteIds?: string[]
  history?: NoteAnswerTurnPayload[]
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function answerNoteQuestion(payload: NoteAnswerPayload): Promise<NoteAnswerResult> {
  const query = payload.query.trim()
  if (!query) {
    throw new ApiError(400, payload, 'Note answer needs a non-blank query')
  }
  const history = (payload.history ?? [])
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
    .filter((turn) => turn.content.length > 0)
    .slice(-8)
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/note-answers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...llmRequestHeaders(),
      ...embeddingRequestHeaders(),
    },
    body: JSON.stringify({
      query,
      k: payload.k,
      node_k: payload.nodeK,
      note_ids: payload.noteIds ?? [],
      ...(history.length > 0 ? { history } : {}),
    }),
  })
  return parseNoteAnswerResult(response.data)
}

function parseNoteAnswerResult(value: unknown): NoteAnswerResult {
  if (!isRecord(value) || typeof value.answer !== 'string' || !value.answer.trim()) {
    throw new ApiError(502, value, 'Note answer response format is invalid')
  }
  if ('thought_model' in value) {
    throw new ApiError(502, value, 'Note answer must not return a ThoughtModel')
  }
  if (typeof value.grounded !== 'boolean' || !Array.isArray(value.nodes) || !Array.isArray(value.hits)) {
    throw new ApiError(502, value, 'Note answer response format is invalid')
  }
  return {
    answer: value.answer.trim(),
    grounded: value.grounded,
    refuseReason: readRefuseReason(value.refuse_reason),
    citedBlockIds: readStringList(value.cited_block_ids),
    nodes: value.nodes.map((item) => parseNode(item)),
    hits: value.hits.map((item) => parseHit(item)),
  }
}

function parseNode(value: unknown): GraphRagNodeHit {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Note answer node is invalid')
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
    throw new ApiError(502, value, 'Note answer hit is invalid')
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

function readRefuseReason(value: unknown): NoteAnswerRefuseReason | null {
  if (value == null) {
    return null
  }
  if (
    value === 'no_confirmed_nodes' ||
    value === 'no_similar_nodes' ||
    value === 'no_anchored_blocks' ||
    value === 'no_passages' ||
    value === 'insufficient_evidence'
  ) {
    return value
  }
  throw new ApiError(502, value, 'Note answer refuse_reason is invalid')
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readScore(record: Record<string, unknown>): number {
  const score = record.score
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new ApiError(502, record, 'Note answer missing score')
  }
  return score
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(502, record, `Note answer missing ${key}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
