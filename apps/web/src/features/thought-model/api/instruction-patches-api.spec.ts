import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import { compileInstructionPatch } from './instruction-patches-api'

vi.mock('@/api/http-client', async () => {
  const actual = await vi.importActual<typeof import('@/api/http-client')>('@/api/http-client')
  return {
    ...actual,
    customFetch: vi.fn(),
  }
})

import { customFetch } from '@/api/http-client'

const payload = {
  instruction: '把论点改成结构必须回到笔记',
  note_id: 'note-1',
  thought_model: {
    id: 'model-1',
    note_id: 'note-1',
    version: 2,
    title: '原文笔记',
    nodes: [],
    edges: [],
  },
  source_anchors: [{ id: 'a1', block_id: 'b1', start_offset: 0, end_offset: 2 }],
}

describe('compileInstructionPatch', () => {
  beforeEach(() => {
    vi.mocked(customFetch).mockReset()
  })

  it('posts snake_case and maps ops into camelCase ModelPatch', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        id: 'patch-nl-note-1-v2',
        note_id: 'note-1',
        base_model_version: 2,
        reason: '把论点改成结构必须回到笔记',
        ops: [
          { op: 'update_node_text', node_id: 'n1', text: '结构必须回到笔记' },
          { op: 'delete_node', node_id: 'n2' },
          { op: 'move_anchor', anchor_id: 'a1', start_offset: 1, end_offset: 4 },
        ],
      },
      status: 200,
      headers: new Headers(),
    })

    await expect(compileInstructionPatch(payload)).resolves.toEqual({
      id: 'patch-nl-note-1-v2',
      noteId: 'note-1',
      baseModelVersion: 2,
      reason: '把论点改成结构必须回到笔记',
      ops: [
        { op: 'update_node_text', nodeId: 'n1', text: '结构必须回到笔记' },
        { op: 'delete_node', nodeId: 'n2' },
        { op: 'move_anchor', anchorId: 'a1', startOffset: 1, endOffset: 4 },
      ],
    })

    expect(customFetch).toHaveBeenCalledWith(
      '/api/v1/instruction-patches',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    )
  })

  it('rejects a response that includes ThoughtModel fields or add_node', async () => {
    vi.mocked(customFetch).mockResolvedValue({
      data: {
        id: 'patch-1',
        note_id: 'note-1',
        base_model_version: 1,
        reason: 'demo',
        ops: [{ op: 'delete_node', node_id: 'n1' }],
        thought_model: { nodes: [] },
      },
      status: 200,
      headers: new Headers(),
    })
    await expect(compileInstructionPatch(payload)).rejects.toBeInstanceOf(ApiError)

    vi.mocked(customFetch).mockResolvedValue({
      data: {
        id: 'patch-1',
        note_id: 'note-1',
        base_model_version: 1,
        reason: 'demo',
        ops: [{ op: 'add_node', text: '覆盖全文' }],
      },
      status: 200,
      headers: new Headers(),
    })
    await expect(compileInstructionPatch(payload)).rejects.toBeInstanceOf(ApiError)
  })
})
