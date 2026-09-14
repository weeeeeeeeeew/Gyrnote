import { ApiError, customFetch } from '@/api/http-client'

import type { CandidateThoughtModel } from '../domain/thought-model'
import { parseCandidateThoughtModel, type CandidateCompilePayload } from './candidates-api'

export type CandidateJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface CandidateJobSnapshot {
  jobId: string
  status: CandidateJobStatus
  candidate: CandidateThoughtModel | null
  error: string | null
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export async function enqueueCandidateCompile(
  payload: CandidateCompilePayload,
): Promise<CandidateJobSnapshot> {
  const response = await customFetch<ApiResponse<unknown>>('/api/v1/candidate-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseCandidateJobSnapshot(response.data)
}

export async function getCandidateJob(jobId: string): Promise<CandidateJobSnapshot> {
  const response = await customFetch<ApiResponse<unknown>>(
    `/api/v1/candidate-jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
  )
  return parseCandidateJobSnapshot(response.data)
}

export async function compileCandidateModelViaJob(
  payload: CandidateCompilePayload,
  options?: { pollDelayMs?: number; maxAttempts?: number },
): Promise<CandidateThoughtModel> {
  const pollDelayMs = options?.pollDelayMs ?? 400
  const maxAttempts = options?.maxAttempts ?? 45
  let snapshot = await enqueueCandidateCompile(payload)
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (snapshot.status === 'succeeded') {
      if (!snapshot.candidate) {
        throw new ApiError(502, snapshot, 'Candidate job succeeded without a candidate')
      }
      return snapshot.candidate
    }
    if (snapshot.status === 'failed') {
      throw new ApiError(502, snapshot, snapshot.error ?? 'Candidate compile job failed')
    }
    await wait(pollDelayMs)
    snapshot = await getCandidateJob(snapshot.jobId)
  }
  throw new ApiError(504, snapshot, 'Candidate compile job timed out')
}

function parseCandidateJobSnapshot(value: unknown): CandidateJobSnapshot {
  if (!isRecord(value)) {
    throw new ApiError(502, value, 'Candidate job response format is invalid')
  }
  if ('thought_model' in value) {
    throw new ApiError(502, value, 'Candidate job must not return a confirmed ThoughtModel')
  }
  const { job_id, status, candidate, error } = value
  if (
    typeof job_id !== 'string' ||
    !job_id.trim() ||
    (status !== 'queued' && status !== 'running' && status !== 'succeeded' && status !== 'failed')
  ) {
    throw new ApiError(502, value, 'Candidate job response format is invalid')
  }
  if (status === 'succeeded') {
    return {
      jobId: job_id,
      status,
      candidate: parseCandidateThoughtModel(candidate),
      error: null,
    }
  }
  if (candidate != null) {
    throw new ApiError(502, value, 'Non-succeeded candidate job must not include a candidate')
  }
  if (status === 'failed') {
    if (typeof error !== 'string' || !error.trim()) {
      throw new ApiError(502, value, 'Failed candidate job must include an error')
    }
    return { jobId: job_id, status, candidate: null, error }
  }
  return { jobId: job_id, status, candidate: null, error: null }
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
