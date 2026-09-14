import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from '@/features/auth/stores/auth'

import { createNote, getNote, saveNoteVersion } from './notes-api'

const emptyThoughtModel = {
  id: 'model-1',
  note_id: 'note-1',
  version: 1,
  title: '原文锚定',
  nodes: [] as [],
  edges: [] as [],
}

const payload = {
  title: '原文锚定',
  content_json: { type: 'doc' },
  source_anchors: [],
  thought_model: emptyThoughtModel,
  graph_layout: {
    node_positions: {},
    edge_path_style: 'default' as const,
  },
}

function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(data),
  }
}

describe('notes api', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates a note with the current bearer token', async () => {
    const auth = useAuthStore()
    auth.accessToken = 'access-token'
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'note-1', revision: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createNote(payload)).resolves.toEqual({ id: 'note-1', revision: 1 })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notes',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.any(Headers),
        body: JSON.stringify(payload),
      }),
    )
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer access-token')
  })

  it('posts a new immutable version under the note id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'note-1', revision: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    const versionPayload = { ...payload, expected_revision: 1 }

    await expect(saveNoteVersion('note-1', versionPayload)).resolves.toEqual({
      id: 'note-1',
      revision: 2,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notes/note-1/versions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(versionPayload) }),
    )
  })

  it('loads a persisted note with its canonical JSON and source anchors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        id: 'note-1',
        revision: 2,
        title: '原文锚定',
        content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原文' }] }] },
        source_anchors: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            block_id: 'block-source',
            start_offset: 0,
            end_offset: 2,
            quote: '原文',
            quote_hash: 'fnv1a32-v1:12345678',
          },
        ],
        thought_model: emptyThoughtModel,
        graph_layout: {
          node_positions: { n1: { x: 10, y: 20 } },
          edge_path_style: 'straight',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getNote('note-1')).resolves.toMatchObject({
      id: 'note-1',
      revision: 2,
      content_json: { type: 'doc' },
      source_anchors: [expect.objectContaining({ block_id: 'block-source' })],
      thought_model: expect.objectContaining({ note_id: 'note-1', nodes: [] }),
      graph_layout: expect.objectContaining({
        edge_path_style: 'straight',
        node_positions: { n1: { x: 10, y: 20 } },
      }),
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/notes/note-1',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
