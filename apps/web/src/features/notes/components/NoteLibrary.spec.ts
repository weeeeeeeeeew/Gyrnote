import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NoteLibrary from './NoteLibrary.vue'

const emptyProps = {
  notes: [] as const,
  currentNoteId: null,
  loading: false,
  errorMessage: null,
  collapsed: false,
}

describe('NoteLibrary', () => {
  it('emits open with the selected note id', async () => {
    const wrapper = mount(NoteLibrary, {
      props: {
        ...emptyProps,
        notes: [
          {
            id: 'note-1',
            title: '秋招方向',
            revision: 2,
            updated_at: '2026-09-14T12:00:00+00:00',
          },
        ],
        currentNoteId: 'note-1',
      },
    })

    await wrapper.get('.note-library__list button').trigger('click')
    expect(wrapper.emitted('open')).toEqual([['note-1']])
  })

  it('emits create and startExample from the directory actions', async () => {
    const wrapper = mount(NoteLibrary, {
      props: emptyProps,
    })

    await wrapper.get('[aria-label="新建笔记"]').trigger('click')
    await wrapper.get('[aria-label="从示例开始"]').trigger('click')
    expect(wrapper.emitted('create')).toEqual([[]])
    expect(wrapper.emitted('startExample')).toEqual([[]])
  })

  it('can collapse to a rail and expand again', async () => {
    const expanded = mount(NoteLibrary, {
      props: emptyProps,
    })
    await expanded.get('[aria-label="收起目录"]').trigger('click')
    expect(expanded.emitted('toggleCollapse')).toEqual([[]])
    expanded.unmount()

    const collapsed = mount(NoteLibrary, {
      props: { ...emptyProps, collapsed: true },
    })
    expect(collapsed.get('[aria-label="展开目录"]').text()).toBe('笔记')
    await collapsed.get('[aria-label="展开目录"]').trigger('click')
    expect(collapsed.emitted('toggleCollapse')).toEqual([[]])
  })
})
