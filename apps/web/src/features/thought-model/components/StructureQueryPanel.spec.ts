import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StructureQueryPanel from './StructureQueryPanel.vue'

vi.mock('../api/structure-queries-api', () => ({
  STRUCTURE_QUERY_KINDS: ['unsupported_claims', 'shared_assumption', 'open_questions'],
  runStructureQuery: vi.fn(),
}))

import { runStructureQuery } from '../api/structure-queries-api'

describe('StructureQueryPanel', () => {
  beforeEach(() => {
    vi.mocked(runStructureQuery).mockReset()
  })

  it('starts collapsed so the confirmed graph keeps space', () => {
    const wrapper = mount(StructureQueryPanel)
    expect(wrapper.find('.structure-query__actions').exists()).toBe(false)
  })

  it('lists hits and emits openNote with the note id', async () => {
    vi.mocked(runStructureQuery).mockResolvedValue({
      kind: 'open_questions',
      hits: [
        {
          noteId: 'note-open',
          noteTitle: '未闭环问题笔记',
          nodeId: 'q-open',
          nodeType: 'open_question',
          nodeText: '检索对象到底是图还是笔记？',
          reason: 'no answers edge',
          quotes: [],
        },
      ],
    })
    const wrapper = mount(StructureQueryPanel)

    await wrapper.get('.structure-query__toggle').trigger('click')
    await wrapper.get('.structure-query__actions button').trigger('click')
    await flushPromises()

    expect(runStructureQuery).toHaveBeenCalledWith('unsupported_claims')
    const hitButton = wrapper.findAll('button').at(-1)
    await hitButton!.trigger('click')
    expect(wrapper.emitted('openNote')).toEqual([['note-open']])
  })
})
