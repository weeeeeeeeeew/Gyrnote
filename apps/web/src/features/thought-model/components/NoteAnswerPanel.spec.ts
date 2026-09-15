import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/http-client'
import { renderTeleportStub } from '@/test-support/teleport-stub'

import NoteAnswerPanel from './NoteAnswerPanel.vue'

vi.mock('../api/note-answers-api', () => ({
  answerNoteQuestion: vi.fn(),
}))

import { answerNoteQuestion } from '../api/note-answers-api'

describe('NoteAnswerPanel', () => {
  beforeEach(() => {
    vi.mocked(answerNoteQuestion).mockReset()
  })

  it('asks in a chat thread against the current note and emits openNote', async () => {
    vi.mocked(answerNoteQuestion).mockResolvedValue({
      answer: 'T0 目标是字节跳动。',
      grounded: true,
      refuseReason: null,
      citedBlockIds: ['b-t0'],
      nodes: [],
      hits: [
        {
          noteId: 'note-body',
          noteTitle: '秋招投递计划',
          nodeId: 'claim-t0',
          blockId: 'b-t0',
          text: 'T0 目标是字节跳动',
          score: 0.91,
        },
      ],
    })
    const wrapper = mount(NoteAnswerPanel, {
      props: { noteId: 'note-current' },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.note-answer__toggle').trigger('click')
    await wrapper.get('textarea').setValue('T0 目标是什么')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(answerNoteQuestion).toHaveBeenCalledWith({
      query: 'T0 目标是什么',
      k: 5,
      noteIds: ['note-current'],
      history: [],
    })
    expect(wrapper.text()).toContain('T0 目标是什么')
    expect(wrapper.findAll('[role="status"]').at(-1)?.text()).toContain('字节跳动')
    await wrapper.get('.note-answer__hits button').trigger('click')
    expect(wrapper.emitted('openNote')).toEqual([['note-body']])
    expect(wrapper.get('.note-answer__cited').text()).toBe('已引用')
  })

  it('keeps earlier turns and explains a refused answer', async () => {
    vi.mocked(answerNoteQuestion).mockResolvedValue({
      answer: '当前范围没有已确认或锁定的节点，因此不能回答。',
      grounded: false,
      refuseReason: 'no_confirmed_nodes',
      citedBlockIds: [],
      nodes: [],
      hits: [],
    })
    const wrapper = mount(NoteAnswerPanel, {
      props: { noteId: 'note-current' },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.note-answer__toggle').trigger('click')
    await wrapper.get('textarea').setValue('T0')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.findAll('[role="status"]').at(-1)?.text()).toContain('不能回答')
    expect(wrapper.text()).toContain('没有已确认结构')
    expect(wrapper.text()).toContain('T0')
  })

  it('explains missing model configuration in the thread', async () => {
    vi.mocked(answerNoteQuestion).mockRejectedValue(new ApiError(503, {}, 'LLM_API_KEY is not configured'))
    const wrapper = mount(NoteAnswerPanel, {
      props: { noteId: null },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.note-answer__toggle').trigger('click')
    await wrapper.get('textarea').setValue('T0')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.findAll('[role="status"]').at(-1)?.text()).toContain('聊天模型和向量模型')
  })
})
