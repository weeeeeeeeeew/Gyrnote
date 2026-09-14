import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { runStructureQuery } from './structure-queries-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

describe('structure-queries-api', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('maps snake_case hits without accepting a ThoughtModel', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        kind: 'unsupported_claims',
        hits: [
          {
            note_id: 'note-1',
            note_title: '薄弱论点',
            node_id: 'claim-bare',
            node_type: 'claim',
            node_text: '没有证据的主张',
            reason: 'missing evidence supports',
            quotes: ['秋招方向需要可回原文的结构图'],
          },
        ],
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(runStructureQuery('unsupported_claims')).resolves.toEqual({
      kind: 'unsupported_claims',
      hits: [
        {
          noteId: 'note-1',
          noteTitle: '薄弱论点',
          nodeId: 'claim-bare',
          nodeType: 'claim',
          nodeText: '没有证据的主张',
          reason: 'missing evidence supports',
          quotes: ['秋招方向需要可回原文的结构图'],
        },
      ],
    })
  })

  it('rejects a response that includes ThoughtModel fields', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        kind: 'open_questions',
        hits: [],
        thought_model: { nodes: [] },
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(runStructureQuery('open_questions')).rejects.toBeInstanceOf(ApiError)
  })
})
