import { ApiError, customFetch } from '@/api/http-client'
import type { JSONContent } from '@tiptap/core'

import type {
  NoteCreatePayload,
  NoteVersionCreatePayload,
  PersistedGraphLayoutPayload,
  PersistedThoughtModelPayload,
} from '../domain/note-persistence'

export interface NoteSaveResponse {
  id: string
  revision: number
}

export interface NoteReadResponse extends NoteSaveResponse {
  title: string
  content_json: JSONContent
  source_anchors: NoteSourceAnchorResponse[]
  thought_model: PersistedThoughtModelPayload
  graph_layout: PersistedGraphLayoutPayload
}

export interface NoteSourceAnchorResponse {
  id: string
  block_id: string
  start_offset: number
  end_offset: number
  quote: string
  quote_hash: string
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function createNote(payload: NoteCreatePayload): Promise<NoteSaveResponse> {
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseNoteRead(response.data)
}

export async function saveNoteVersion(
  noteId: string,
  payload: NoteVersionCreatePayload,
): Promise<NoteSaveResponse> {
  const response = await customFetch<ApiResponse<unknown>>(`/api/v1/notes/${noteId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseNoteRead(response.data)
}

export async function getNote(noteId: string): Promise<NoteReadResponse> {
  const response = await customFetch<ApiResponse<unknown>>(`/api/v1/notes/${noteId}`, {
    method: 'GET',
  })

  return parseNoteReadResponse(response.data)
}

function parseNoteRead(value: unknown): NoteSaveResponse {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Note API response format is invalid')
  }

  const id = value.id
  const revision = value.revision
  if (typeof id !== 'string' || typeof revision !== 'number' || !Number.isInteger(revision)) {
    throw new ApiError(502, value, 'Note API response format is invalid')
  }

  return { id, revision }
}

function parseNoteReadResponse(value: unknown): NoteReadResponse {
  const saved = parseNoteRead(value)
  if (!isRecord(value) || typeof value.title !== 'string' || !isTiptapDocument(value.content_json)) {
    throw new ApiError(502, value, 'Note API response format is invalid')
  }

  return {
    ...saved,
    title: value.title,
    content_json: value.content_json,
    source_anchors: parseSourceAnchors(value.source_anchors, value),
    thought_model: parseThoughtModel(value.thought_model, value),
    graph_layout: parseGraphLayout(value.graph_layout, value),
  }
}

function parseThoughtModel(value: unknown, response: unknown): PersistedThoughtModelPayload {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.note_id !== 'string' ||
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  ) {
    throw new ApiError(502, response, 'Note API response format is invalid')
  }

  return {
    id: value.id,
    note_id: value.note_id,
    version: value.version,
    title: value.title,
    nodes: value.nodes.map((node) => parsePersistedNode(node, response)),
    edges: value.edges.map((edge) => parsePersistedEdge(edge, response)),
  }
}

function parsePersistedNode(
  value: unknown,
  response: unknown,
): PersistedThoughtModelPayload['nodes'][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.origin !== 'string' ||
    typeof value.explicitness !== 'string' ||
    typeof value.review_status !== 'string' ||
    !Array.isArray(value.source_anchor_ids) ||
    !(value.confidence === null || typeof value.confidence === 'number') ||
    !(value.label === null || typeof value.label === 'string')
  ) {
    throw new ApiError(502, response, 'Note API response format is invalid')
  }
  if (!value.source_anchor_ids.every((item) => typeof item === 'string')) {
    throw new ApiError(502, response, 'Note API response format is invalid')
  }

  return {
    id: value.id,
    type: value.type,
    label: value.label,
    text: value.text,
    origin: value.origin,
    explicitness: value.explicitness,
    review_status: value.review_status,
    confidence: value.confidence,
    source_anchor_ids: value.source_anchor_ids,
  }
}

function parsePersistedEdge(
  value: unknown,
  response: unknown,
): PersistedThoughtModelPayload['edges'][number] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.source_node_id !== 'string' ||
    typeof value.target_node_id !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.origin !== 'string' ||
    typeof value.explicitness !== 'string' ||
    typeof value.review_status !== 'string' ||
    !(value.confidence === null || typeof value.confidence === 'number') ||
    !(value.label === null || typeof value.label === 'string')
  ) {
    throw new ApiError(502, response, 'Note API response format is invalid')
  }

  return {
    id: value.id,
    source_node_id: value.source_node_id,
    target_node_id: value.target_node_id,
    type: value.type,
    label: value.label,
    origin: value.origin,
    explicitness: value.explicitness,
    review_status: value.review_status,
    confidence: value.confidence,
  }
}

function parseGraphLayout(value: unknown, response: unknown): PersistedGraphLayoutPayload {
  if (
    !isRecord(value) ||
    !isRecord(value.node_positions) ||
    typeof value.edge_path_style !== 'string' ||
    !['default', 'smoothstep', 'straight'].includes(value.edge_path_style)
  ) {
    throw new ApiError(502, response, 'Note API response format is invalid')
  }

  const node_positions: Record<string, { x: number; y: number }> = {}
  for (const [nodeId, position] of Object.entries(value.node_positions)) {
    if (
      !isRecord(position) ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      throw new ApiError(502, response, 'Note API response format is invalid')
    }
    node_positions[nodeId] = { x: position.x, y: position.y }
  }

  return {
    node_positions,
    edge_path_style: value.edge_path_style as PersistedGraphLayoutPayload['edge_path_style'],
  }
}

function isTiptapDocument(value: unknown): value is JSONContent {
  return isJsonContent(value) && value.type === 'doc'
}

function isJsonContent(value: unknown): value is JSONContent {
  if (!isRecord(value)) {
    return false
  }

  if (value.type !== undefined && typeof value.type !== 'string') {
    return false
  }
  if (value.text !== undefined && typeof value.text !== 'string') {
    return false
  }

  return value.content === undefined || (Array.isArray(value.content) && value.content.every(isJsonContent))
}

function parseSourceAnchors(value: unknown, response: unknown): NoteSourceAnchorResponse[] {
  if (!Array.isArray(value)) {
    throw new ApiError(502, response, 'Note API response format is invalid')
  }

  return value.map((anchor) => {
    if (
      !isRecord(anchor) ||
      typeof anchor.id !== 'string' ||
      typeof anchor.block_id !== 'string' ||
      typeof anchor.start_offset !== 'number' ||
      typeof anchor.end_offset !== 'number' ||
      typeof anchor.quote !== 'string' ||
      typeof anchor.quote_hash !== 'string'
    ) {
      throw new ApiError(502, response, 'Note API response format is invalid')
    }

    return {
      id: anchor.id,
      block_id: anchor.block_id,
      start_offset: anchor.start_offset,
      end_offset: anchor.end_offset,
      quote: anchor.quote,
      quote_hash: anchor.quote_hash,
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
