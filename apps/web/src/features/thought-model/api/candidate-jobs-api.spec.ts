import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { compileCandidateModelViaJob } from './candidate-jobs-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

const payload = {
  note_id: 'note-1',
  source_revision: 1,
  title: '笔记',
  source_anchors: [{ id: 'anchor-1', quote: '原文', block_id: 'block-1' }],
  note_blocks: [{ id: 'block-1', text: '原文片段在此' }],
}

const candidateBody = {
  id: 'candidate-note-1-1',
  note_id: 'note-1',
  source_revision: 1,
  title: 'LLM 候选',
  proposed_anchors: [],
  nodes: [
    {
      id: 'candidate-observation-1',
      type: 'observation',
      text: '原文',
      source_anchor_ids: ['anchor-1'],
      confidence: 0.7,
    },
  ],
  edges: [],
}

describe('compileCandidateModelViaJob', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('enqueues then polls until succeeded without treating queued as a ThoughtModel', async () => {
    vi.mocked(customFetch)
      .mockResolvedValueOnce({
        data: { job_id: 'job-1', status: 'queued' },
        status: 202,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        data: { job_id: 'job-1', status: 'running' },
        status: 200,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        data: { job_id: 'job-1', status: 'succeeded', candidate: candidateBody },
        status: 200,
        headers: new Headers(),
      })

    await expect(compileCandidateModelViaJob(payload, { pollDelayMs: 0 })).resolves.toMatchObject({
      id: 'candidate-note-1-1',
      noteId: 'note-1',
      sourceRevision: 1,
    })
    expect(customFetch).toHaveBeenCalledTimes(3)
    expect(customFetch).toHaveBeenNthCalledWith(
      1,
      '/api/v1/candidate-jobs',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejects a confirmed ThoughtModel field on the job envelope', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        job_id: 'job-1',
        status: 'queued',
        thought_model: { nodes: [] },
      },
      status: 202,
      headers: new Headers(),
    })
    await expect(compileCandidateModelViaJob(payload, { pollDelayMs: 0 })).rejects.toBeInstanceOf(ApiError)
  })

  it('surfaces failed jobs without applying a candidate', async () => {
    vi.mocked(customFetch)
      .mockResolvedValueOnce({
        data: { job_id: 'job-1', status: 'queued' },
        status: 202,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        data: { job_id: 'job-1', status: 'failed', error: 'compile_candidate_job' },
        status: 200,
        headers: new Headers(),
      })
    await expect(compileCandidateModelViaJob(payload, { pollDelayMs: 0 })).rejects.toMatchObject({
      message: 'compile_candidate_job',
    })
  })
})
