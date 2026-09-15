import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { answerNoteQuestion } from './note-answers-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

describe('note-answers-api', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('maps a grounded answer and sends both chat and embedding headers', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        answer: 'T0 目标是字节跳动。',
        grounded: true,
        refuse_reason: null,
        cited_block_ids: ['b-t0'],
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
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(
      answerNoteQuestion({ query: ' T0 目标是什么 ', k: 5, noteIds: ['note-1'] }),
    ).resolves.toEqual({
      answer: 'T0 目标是字节跳动。',
      grounded: true,
      refuseReason: null,
      citedBlockIds: ['b-t0'],
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
    })
    expect(customFetch).toHaveBeenCalledWith(
      '/api/v1/note-answers',
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

  it('rejects a ThoughtModel payload', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        answer: 'x',
        grounded: true,
        nodes: [],
        hits: [],
        thought_model: { nodes: [] },
      },
      status: 200,
      headers: new Headers(),
    })
    await expect(answerNoteQuestion({ query: 'T0' })).rejects.toBeInstanceOf(ApiError)
  })
})
