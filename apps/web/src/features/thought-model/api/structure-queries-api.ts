import { ApiError, customFetch } from '@/api/http-client'

export const STRUCTURE_QUERY_KINDS = [
  'unsupported_claims',
  'shared_assumption',
  'open_questions',
] as const

export type StructureQueryKind = (typeof STRUCTURE_QUERY_KINDS)[number]

export interface StructureQueryHit {
  noteId: string
  noteTitle: string
  nodeId: string
  nodeType: string
  nodeText: string
  reason: string
  quotes: string[]
}

export interface StructureQueryResult {
  kind: StructureQueryKind
  hits: StructureQueryHit[]
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function runStructureQuery(kind: StructureQueryKind): Promise<StructureQueryResult> {
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/structure-queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  })
  return parseStructureQueryResult(response.data)
}

function parseStructureQueryResult(value: unknown): StructureQueryResult {
  if (!isRecord(value) || !isStructureQueryKind(value.kind) || !Array.isArray(value.hits)) {
    throw new ApiError(502, value, 'Structure query response format is invalid')
  }
  if ('thought_model' in value || 'nodes' in value) {
    throw new ApiError(502, value, 'Structure query must not return a ThoughtModel')
  }
  return {
    kind: value.kind,
    hits: value.hits.map((item) => parseHit(item)),
  }
}

function parseHit(value: unknown): StructureQueryHit {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Structure query hit is invalid')
  }
  const noteId = readString(value, 'note_id')
  const noteTitle = readString(value, 'note_title')
  const nodeId = readString(value, 'node_id')
  const nodeType = readString(value, 'node_type')
  const nodeText = readString(value, 'node_text')
  const reason = readString(value, 'reason')
  if (!Array.isArray(value.quotes) || value.quotes.some((item) => typeof item !== 'string')) {
    throw new ApiError(502, value, 'Structure query quotes must be strings')
  }
  return {
    noteId,
    noteTitle,
    nodeId,
    nodeType,
    nodeText,
    reason,
    quotes: value.quotes,
  }
}

function isStructureQueryKind(value: unknown): value is StructureQueryKind {
  return typeof value === 'string' && (STRUCTURE_QUERY_KINDS as readonly string[]).includes(value)
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(502, record, `Structure query missing ${key}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
