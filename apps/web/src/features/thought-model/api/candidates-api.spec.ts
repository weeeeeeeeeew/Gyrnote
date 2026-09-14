import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { compileCandidateModel } from './candidates-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

describe('compileCandidateModel', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('maps snake_case compile response into the frontend candidate model', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        id: 'candidate-note-1-1',
        note_id: 'note-1',
        source_revision: 1,
        title: 'LLM 候选',
        proposed_anchors: [
          {
            id: 'proposed-1',
            block_id: 'block-1',
            quote: '原文片段',
            start_offset: 0,
            end_offset: 4,
          },
        ],
        nodes: [
          {
            id: 'candidate-observation-1',
            type: 'observation',
            text: '原文',
            source_anchor_ids: ['anchor-1'],
            confidence: 0.7,
          },
        ],
        edges: [
          {
            id: 'candidate-edge-1',
            source_node_id: 'candidate-observation-1',
            target_node_id: 'candidate-observation-1',
            type: 'explains',
            source_anchor_ids: ['anchor-1'],
            confidence: 0.5,
          },
        ],
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(
      compileCandidateModel({
        note_id: 'note-1',
        source_revision: 1,
        title: '笔记',
        source_anchors: [{ id: 'anchor-1', quote: '原文', block_id: 'block-1' }],
        note_blocks: [{ id: 'block-1', text: '原文片段在此' }],
      }),
    ).resolves.toEqual({
      id: 'candidate-note-1-1',
      noteId: 'note-1',
      sourceRevision: 1,
      title: 'LLM 候选',
      proposedAnchors: [
        {
          id: 'proposed-1',
          blockId: 'block-1',
          quote: '原文片段',
          startOffset: 0,
          endOffset: 4,
        },
      ],
      nodes: [
        {
          id: 'candidate-observation-1',
          type: 'observation',
          label: null,
          text: '原文',
          sourceAnchorIds: ['anchor-1'],
          confidence: 0.7,
        },
      ],
      edges: [
        {
          id: 'candidate-edge-1',
          sourceNodeId: 'candidate-observation-1',
          targetNodeId: 'candidate-observation-1',
          type: 'explains',
          label: null,
          sourceAnchorIds: ['anchor-1'],
          confidence: 0.5,
        },
      ],
    })
  })

  it('rejects an invalid compile response envelope', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: { ok: false },
      status: 200,
      headers: new Headers(),
    })

    await expect(
      compileCandidateModel({
        note_id: 'note-1',
        source_revision: 1,
        title: '笔记',
        source_anchors: [],
        note_blocks: [],
      }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
