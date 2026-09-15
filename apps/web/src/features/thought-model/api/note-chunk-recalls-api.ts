import { ApiError, customFetch } from '@/api/http-client'
import { embeddingRequestHeaders } from './llm-settings'

export interface NoteChunkHit {
  noteId: string
  noteTitle: string
  blockId: string
  text: string
  score: number
}

export interface NoteChunkRecallResult {
  hits: NoteChunkHit[]
  indexedChunkCount: number
}

export interface NoteChunkRecallPayload {
  query?: string
  queryEmbedding?: number[]
  k?: number
  noteIds?: string[]
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function recallNoteChunks(payload: NoteChunkRecallPayload): Promise<NoteChunkRecallResult> {
  const query = payload.query?.trim() ?? ''
  const hasQuery = query.length > 0
  const hasEmbedding = Array.isArray(payload.queryEmbedding) && payload.queryEmbedding.length > 0
  if (hasQuery === hasEmbedding) {
    throw new ApiError(400, payload, 'Note chunk recall needs exactly one of query or queryEmbedding')
  }
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/note-chunk-recalls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...embeddingRequestHeaders() },
    body: JSON.stringify({
      ...(hasQuery ? { query } : { query_embedding: payload.queryEmbedding }),
      k: payload.k,
      note_ids: payload.noteIds ?? [],
    }),
  })
  return parseNoteChunkRecallResult(response.data)
}

function parseNoteChunkRecallResult(value: unknown): NoteChunkRecallResult {
  if (!isRecord(value) || !Array.isArray(value.hits)) {
    throw new ApiError(502, value, 'Note chunk recall response format is invalid')
  }
  if ('thought_model' in value || 'nodes' in value) {
    throw new ApiError(502, value, 'Note chunk recall must not return a ThoughtModel')
  }
  return {
    hits: value.hits.map((item) => parseHit(item)),
    indexedChunkCount: readIndexedCount(value),
  }
}

function readIndexedCount(value: Record<string, unknown>): number {
  const count = value.indexed_chunk_count
  if (typeof count === 'number' && Number.isInteger(count) && count >= 0) {
    return count
  }
  return 0
}

function parseHit(value: unknown): NoteChunkHit {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Note chunk recall hit is invalid')
  }
  const score = value.score
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new ApiError(502, value, 'Note chunk recall missing score')
  }
  return {
    noteId: readString(value, 'note_id'),
    noteTitle: readString(value, 'note_title'),
    blockId: readString(value, 'block_id'),
    text: readString(value, 'text'),
    score,
  }
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(502, record, `Note chunk recall missing ${key}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
