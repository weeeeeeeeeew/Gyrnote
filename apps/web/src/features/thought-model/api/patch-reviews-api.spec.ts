import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { resumePatchReview, startPatchReview } from './patch-reviews-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

describe('patch-reviews-api', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('maps start response without accepting ThoughtModel', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        thread_id: 'thread-1',
        patch_id: 'patch-1',
        status: 'awaiting_review',
        ops: [{ op: 'delete_node', nodeId: 'n1' }],
      },
      status: 201,
      headers: new Headers(),
    })

    await expect(
      startPatchReview({
        patchId: 'patch-1',
        ops: [{ op: 'delete_node', nodeId: 'n1' }],
      }),
    ).resolves.toEqual({
      threadId: 'thread-1',
      patchId: 'patch-1',
      status: 'awaiting_review',
      ops: [{ op: 'delete_node', nodeId: 'n1' }],
    })
  })

  it('rejects a response that includes ThoughtModel fields', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        thread_id: 'thread-1',
        patch_id: 'patch-1',
        status: 'approved',
        ops: [],
        thought_model: { nodes: [] },
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(
      resumePatchReview({ threadId: 'thread-1', decision: 'approve' }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
