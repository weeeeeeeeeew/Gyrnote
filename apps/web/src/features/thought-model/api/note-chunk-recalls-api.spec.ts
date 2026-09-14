import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { recallNoteChunks } from './note-chunk-recalls-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

describe('note-chunk-recalls-api', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('maps snake_case hits without accepting a ThoughtModel', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        hits: [
          {
            note_id: 'note-1',
            note_title: '原文笔记',
            block_id: 'b-body',
            text: '秋招方向需要可回原文的结构图',
            score: 0.91,
          },
        ],
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(
      recallNoteChunks({ queryEmbedding: [1, 0], k: 3 }),
    ).resolves.toEqual({
      hits: [
        {
          noteId: 'note-1',
          noteTitle: '原文笔记',
          blockId: 'b-body',
          text: '秋招方向需要可回原文的结构图',
          score: 0.91,
        },
      ],
    })
  })

  it('rejects a response that includes ThoughtModel fields', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        hits: [],
        thought_model: { nodes: [] },
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(recallNoteChunks({ queryEmbedding: [1, 0] })).rejects.toBeInstanceOf(ApiError)
  })

  it('sends query text without a client embedding', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: { hits: [] },
      status: 200,
      headers: new Headers(),
    })

    await recallNoteChunks({ query: ' 秋招方向 ', k: 5, noteIds: ['note-1'] })

    expect(customFetch).toHaveBeenCalledWith(
      '/api/v1/note-chunk-recalls',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: '秋招方向',
          k: 5,
          note_ids: ['note-1'],
        }),
      }),
    )
  })

  it('rejects sending both query and queryEmbedding', async () => {
    await expect(
      recallNoteChunks({ query: '秋招', queryEmbedding: [1, 0] }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(customFetch).not.toHaveBeenCalled()
  })
})
