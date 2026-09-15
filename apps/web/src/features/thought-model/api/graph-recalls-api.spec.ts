import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { recallGraphPassages } from './graph-recalls-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

describe('graph-recalls-api', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('maps dual-layer hits without accepting a ThoughtModel', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        nodes: [
          {
            note_id: 'note-1',
            note_title: '秋招投递计划',
            node_id: 'claim-t0',
            node_type: 'claim',
            node_text: 'T0 目标是字节跳动',
            score: 0.88,
          },
        ],
        hits: [
          {
            note_id: 'note-1',
            note_title: '秋招投递计划',
            node_id: 'claim-t0',
            block_id: 'b-t0',
            text: 'T0 目标是字节跳动',
            score: 0.91,
          },
        ],
        scoped_block_count: 1,
        empty_reason: null,
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(recallGraphPassages({ query: 'T0 目标是什么', k: 5, noteIds: ['note-1'] })).resolves.toEqual({
      nodes: [
        {
          noteId: 'note-1',
          noteTitle: '秋招投递计划',
          nodeId: 'claim-t0',
          nodeType: 'claim',
          nodeText: 'T0 目标是字节跳动',
          score: 0.88,
        },
      ],
      hits: [
        {
          noteId: 'note-1',
          noteTitle: '秋招投递计划',
          nodeId: 'claim-t0',
          blockId: 'b-t0',
          text: 'T0 目标是字节跳动',
          score: 0.91,
        },
      ],
      scopedBlockCount: 1,
      emptyReason: null,
    })
    expect(customFetch).toHaveBeenCalledWith(
      '/api/v1/graph-recalls',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: 'T0 目标是什么',
          k: 5,
          note_ids: ['note-1'],
        }),
      }),
    )
  })

  it('rejects a response that includes ThoughtModel fields', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        nodes: [],
        hits: [],
        thought_model: { nodes: [] },
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(recallGraphPassages({ queryEmbedding: [1, 0] })).rejects.toBeInstanceOf(ApiError)
  })
})
