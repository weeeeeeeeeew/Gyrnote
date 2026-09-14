import { ApiError, customFetch } from '@/api/http-client'

import type { PersistedThoughtModelPayload } from '@/features/notes/domain/note-persistence'

import type { ModelPatch, ModelPatchOp } from '../domain/model-patch'

export interface InstructionPatchPayload {
  instruction: string
  note_id: string
  thought_model: PersistedThoughtModelPayload
  source_anchors: Array<{
    id: string
    block_id: string
    start_offset: number
    end_offset: number
  }>
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function compileInstructionPatch(payload: InstructionPatchPayload): Promise<ModelPatch> {
  const instruction = payload.instruction.trim()
  if (!instruction) {
    throw new ApiError(400, payload, 'Instruction patch needs a non-blank instruction')
  }
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/instruction-patches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction,
      note_id: payload.note_id,
      thought_model: payload.thought_model,
      source_anchors: payload.source_anchors,
    }),
  })
  return parseInstructionPatch(response.data)
}

function parseInstructionPatch(value: unknown): ModelPatch {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Instruction patch API response format is invalid')
  }
  if ('thought_model' in value || 'nodes' in value) {
    throw new ApiError(502, value, 'Instruction patch API must not return ThoughtModel')
  }
  const { id, note_id, base_model_version, reason, ops } = value
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof note_id !== 'string' ||
    !note_id.trim() ||
    typeof base_model_version !== 'number' ||
    !Number.isInteger(base_model_version) ||
    base_model_version < 1 ||
    typeof reason !== 'string' ||
    !reason.trim() ||
    !Array.isArray(ops) ||
    ops.length === 0
  ) {
    throw new ApiError(502, value, 'Instruction patch API response format is invalid')
  }
  if (id === note_id) {
    throw new ApiError(502, value, 'Instruction patch id must not equal note_id')
  }
  return {
    id,
    noteId: note_id,
    baseModelVersion: base_model_version,
    reason,
    ops: ops.map((op) => parseInstructionOp(op, value)),
  }
}

function parseInstructionOp(value: unknown, response: unknown): ModelPatchOp {
  if (!isRecord(value) || typeof value.op !== 'string') {
    throw new ApiError(502, response, 'Instruction patch op is invalid')
  }
  if (value.op === 'update_node_text') {
    return {
      op: 'update_node_text',
      nodeId: readString(value, 'node_id', response),
      text: readString(value, 'text', response),
    }
  }
  if (value.op === 'delete_node') {
    return {
      op: 'delete_node',
      nodeId: readString(value, 'node_id', response),
    }
  }
  if (value.op === 'move_anchor') {
    const startOffset = value.start_offset
    const endOffset = value.end_offset
    if (
      typeof startOffset !== 'number' ||
      !Number.isInteger(startOffset) ||
      startOffset < 0 ||
      typeof endOffset !== 'number' ||
      !Number.isInteger(endOffset) ||
      endOffset <= startOffset
    ) {
      throw new ApiError(502, response, 'Instruction patch move_anchor offsets are invalid')
    }
    return {
      op: 'move_anchor',
      anchorId: readString(value, 'anchor_id', response),
      startOffset,
      endOffset,
    }
  }
  throw new ApiError(502, response, 'Instruction patch op is not allowed')
}

function readString(record: Record<string, unknown>, key: string, response: unknown): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(502, response, `Instruction patch missing ${key}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
