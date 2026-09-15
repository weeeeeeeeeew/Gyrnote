import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import InstructionChatPanel from './InstructionChatPanel.vue'

describe('InstructionChatPanel', () => {
  it('emits send with the trimmed instruction and keeps the thread', async () => {
    const wrapper = mount(InstructionChatPanel, {
      props: { feedback: null, reviewBusy: false },
    })

    await wrapper.get('textarea').setValue('  把论点改成结构必须回到笔记  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('send')).toEqual([['把论点改成结构必须回到笔记']])
    expect(wrapper.text()).toContain('把论点改成结构必须回到笔记')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('lists a pending instruction patch without local apply controls', () => {
    const wrapper = mount(InstructionChatPanel, {
      props: {
        feedback: null,
        reviewBusy: false,
        patch: {
          id: 'patch-1',
          noteId: 'note-1',
          baseModelVersion: 1,
          reason: 'instruction',
          ops: [{ op: 'delete_node', nodeId: 'n2' }],
        },
      },
    })

    expect(wrapper.text()).toContain('delete_node')
    expect(wrapper.text()).not.toContain('批准应用')
    expect(wrapper.text()).not.toContain('丢弃')
  })
})
