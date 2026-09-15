import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'
import { renderTeleportStub } from '@/test-support/teleport-stub'

import ChunkRecallPanel from './ChunkRecallPanel.vue'

vi.mock('../api/note-chunk-recalls-api', () => ({
  recallNoteChunks: vi.fn(),
}))
vi.mock('../api/graph-recalls-api', () => ({
  recallGraphPassages: vi.fn(),
}))

import { recallGraphPassages } from '../api/graph-recalls-api'
import { recallNoteChunks } from '../api/note-chunk-recalls-api'

describe('ChunkRecallPanel', () => {
  beforeEach(() => {
    vi.mocked(recallGraphPassages).mockReset()
    vi.mocked(recallNoteChunks).mockReset()
  })

  it('defaults to dual-layer graph recall and emits openNote from a passage', async () => {
    vi.mocked(recallGraphPassages).mockResolvedValue({
      nodes: [
        {
          noteId: 'note-body',
          noteTitle: '原文笔记',
          nodeId: 'claim-t0',
          nodeType: 'claim',
          nodeText: 'T0 目标是字节跳动',
          score: 0.88,
        },
      ],
      hits: [
        {
          noteId: 'note-body',
          noteTitle: '原文笔记',
          nodeId: 'claim-t0',
          blockId: 'block-a',
          text: '秋招方向需要可回原文的结构图',
          score: 0.91,
        },
      ],
      scopedBlockCount: 1,
      emptyReason: null,
    })
    const wrapper = mount(ChunkRecallPanel, {
      props: { noteId: 'note-current' },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[type="search"]').setValue('秋招方向')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recallGraphPassages).toHaveBeenCalledWith({
      query: '秋招方向',
      k: 5,
      noteIds: ['note-current'],
    })
    expect(recallNoteChunks).not.toHaveBeenCalled()
    const passageButton = wrapper.findAll('.chunk-recall__hits button').at(1)
    await passageButton?.trigger('click')
    expect(wrapper.emitted('openNote')).toEqual([['note-body']])
  })

  it('scopes to the current note when checked', async () => {
    vi.mocked(recallGraphPassages).mockResolvedValue({
      nodes: [],
      hits: [],
      scopedBlockCount: 0,
      emptyReason: 'no_confirmed_nodes',
    })
    const wrapper = mount(ChunkRecallPanel, {
      props: { noteId: 'note-current' },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[name="current-note-only"]').setValue(true)
    await wrapper.get('input[type="search"]').setValue('共同前提')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recallGraphPassages).toHaveBeenCalledWith({
      query: '共同前提',
      k: 5,
      noteIds: ['note-current'],
    })
    expect(wrapper.get('[role="status"]').text()).toContain('没有已确认或锁定的节点')
  })

  it('explains missing embeddings configuration', async () => {
    vi.mocked(recallGraphPassages).mockRejectedValue(new ApiError(503, {}, 'note embeddings are disabled'))
    const wrapper = mount(ChunkRecallPanel, {
      props: { noteId: null },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[type="search"]').setValue('秋招')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('独立 embeddings')
  })

  it('uses full-corpus recall only when 全文补漏 is checked', async () => {
    vi.mocked(recallNoteChunks).mockResolvedValue({ hits: [], indexedChunkCount: 4 })
    const wrapper = mount(ChunkRecallPanel, {
      props: { noteId: 'note-current' },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.chunk-recall__toggle').trigger('click')
    await wrapper.get('input[name="full-corpus"]').setValue(true)
    await wrapper.get('input[type="search"]').setValue('我的T0目标是什么')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(recallNoteChunks).toHaveBeenCalledWith({
      query: '我的T0目标是什么',
      k: 5,
      noteIds: ['note-current'],
    })
    expect(recallGraphPassages).not.toHaveBeenCalled()
    expect(wrapper.get('[role="status"]').text()).toContain('正文不含这几个字')
    expect(wrapper.get('[role="status"]').text()).toContain('不够像')
  })
})
