import { ApiError, customFetch } from '@/api/http-client'

export type PatchReviewStatus = 'awaiting_review' | 'approved' | 'rejected'
export type PatchReviewDecision = 'approve' | 'reject'

export interface PatchReviewSnapshot {
  threadId: string
  patchId: string
  status: PatchReviewStatus
  ops: Array<Record<string, unknown>>
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function startPatchReview(payload: {
  patchId: string
  ops: Array<Record<string, unknown>>
}): Promise<PatchReviewSnapshot> {
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/patch-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patch_id: payload.patchId,
      ops: payload.ops,
    }),
  })
  return parsePatchReviewSnapshot(response.data)
}

export async function resumePatchReview(payload: {
  threadId: string
  decision: PatchReviewDecision
}): Promise<PatchReviewSnapshot> {
  const response = await customFetch<ApiResponse<unknown>>(
    `/api/v1/patch-reviews/${encodeURIComponent(payload.threadId)}/resume`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: payload.decision }),
    },
  )
  return parsePatchReviewSnapshot(response.data)
}

function parsePatchReviewSnapshot(value: unknown): PatchReviewSnapshot {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Patch review API response format is invalid')
  }
  const { thread_id, patch_id, status, ops } = value
  if (
    typeof thread_id !== 'string' ||
    typeof patch_id !== 'string' ||
    (status !== 'awaiting_review' && status !== 'approved' && status !== 'rejected') ||
    !Array.isArray(ops)
  ) {
    throw new ApiError(502, value, 'Patch review API response format is invalid')
  }
  if ('thought_model' in value || 'nodes' in value) {
    throw new ApiError(502, value, 'Patch review API must not return ThoughtModel')
  }
  return {
    threadId: thread_id,
    patchId: patch_id,
    status,
    ops: ops.filter(isRecord),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
