import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api/http-client'

import { createNote, getNote, saveNoteVersion } from '../api/notes-api'
import type { NoteVersionSaveInput } from '../domain/note-persistence'
import { useNotePersistenceStore } from './note-persistence'

vi.mock('../api/notes-api', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  saveNoteVersion: vi.fn(),
}))

const mockedCreateNote = vi.mocked(createNote)
const mockedGetNote = vi.mocked(getNote)
const mockedSaveNoteVersion = vi.mocked(saveNoteVersion)

const input: NoteVersionSaveInput = {
  title: '原文锚定',
  contentJson: { type: 'doc' },
  sourceAnchors: [],
  thoughtModel: {
    id: 'model-1',
    noteId: 'note-1',
    version: 1,
    title: '原文锚定',
    nodes: [],
    edges: [],
  },
  graphLayout: {
    nodePositions: {},
    edgePathStyle: 'default',
  },
  expectedRevision: 1,
}

describe('useNotePersistenceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedCreateNote.mockResolvedValue({
      id: 'note-1',
      revision: 1,
    })
    mockedSaveNoteVersion.mockResolvedValue({
      id: 'note-1',
      revision: 2,
    })
    mockedGetNote.mockResolvedValue({
      id: 'note-1',
      revision: 2,
      title: '原文锚定',
      content_json: { type: 'doc' },
      source_anchors: [],
      thought_model: {
        id: 'model-1',
        note_id: 'note-1',
        version: 1,
        title: '原文锚定',
        nodes: [],
        edges: [],
      },
      graph_layout: {
        node_positions: {},
        edge_path_style: 'default',
      },
    })
  })

  it('creates first note, then appends a version using the server revision', async () => {
    const store = useNotePersistenceStore()

    await store.save(input)
    expect(store.noteId).toBe('note-1')
    expect(store.revision).toBe(1)
    expect(store.status).toBe('saved')
    expect(mockedCreateNote).toHaveBeenCalledOnce()

    store.markDirty()
    await store.save({ ...input, expectedRevision: 99 })
    expect(mockedSaveNoteVersion).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({ expected_revision: 1 }),
    )
    expect(store.revision).toBe(2)
  })

  it('surfaces the current revision when the backend rejects a stale save', async () => {
    const store = useNotePersistenceStore()
    await store.save(input)
    store.markDirty()
    mockedSaveNoteVersion.mockRejectedValueOnce(
      new ApiError(409, { detail: { current_revision: 4 } }),
    )

    await expect(store.save(input)).rejects.toBeInstanceOf(ApiError)
    expect(store.status).toBe('error')
    expect(store.conflictRevision).toBe(4)
    expect(store.errorMessage).toContain('第 4 版')
  })

  it('hydrates the note id and revision from a persisted note', async () => {
    const store = useNotePersistenceStore()

    const note = await store.load('note-1')

    expect(mockedGetNote).toHaveBeenCalledWith('note-1')
    expect(note.content_json).toEqual({ type: 'doc' })
    expect(store.noteId).toBe('note-1')
    expect(store.revision).toBe(2)
    expect(store.loadStatus).toBe('loaded')
    expect(store.status).toBe('saved')
  })
})
