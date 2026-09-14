import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'

import ChunkRecallPanel from './ChunkRecallPanel.vue'

vi.mock('../api/note-chunk-recalls-api', () => ({
  recallNoteChunks: vi.fn(),
}))

import { recallNoteChunks } from '../api/note-chunk-recalls-api'

describe('ChunkRecallPanel', () => {
  beforeEach(() => {
    vi.mocked(recallNoteChunks).mockReset()
  })

  it('recalls note body hits and emits openNote', async () => {
    vi.mocked(recallNoteChunks).mockResolvedValue({
      hits: [
        {
          noteId: 'note-body',
          noteTitle: '原文笔记',
          blockId: 'block-a',
          text: '秋招方向需要可回原文的结构图',
          score: 0.91,
        },
      ],
    })
    const wrapper = mount(ChunkRecallPanel, { props: { noteId: 'note-current' } })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[type="search"]').setValue('秋招方向')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recallNoteChunks).toHaveBeenCalledWith({
      query: '秋招方向',
      k: 5,
      noteIds: undefined,
    })
    await wrapper.get('.chunk-recall__hits button').trigger('click')
    expect(wrapper.emitted('openNote')).toEqual([['note-body']])
  })

  it('scopes to the current note when checked', async () => {
    vi.mocked(recallNoteChunks).mockResolvedValue({ hits: [] })
    const wrapper = mount(ChunkRecallPanel, { props: { noteId: 'note-current' } })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('input[type="search"]').setValue('共同前提')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recallNoteChunks).toHaveBeenCalledWith({
      query: '共同前提',
      k: 5,
      noteIds: ['note-current'],
    })
    expect(wrapper.get('[role="status"]').text()).toContain('没有命中')
  })

  it('explains missing embeddings configuration', async () => {
    vi.mocked(recallNoteChunks).mockRejectedValue(new ApiError(503, {}, 'note embeddings are disabled'))
    const wrapper = mount(ChunkRecallPanel, { props: { noteId: null } })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[type="search"]').setValue('秋招')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('独立 embeddings')
  })
})
