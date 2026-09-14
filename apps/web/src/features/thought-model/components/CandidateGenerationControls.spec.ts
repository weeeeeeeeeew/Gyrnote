import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CandidateGenerationControls from './CandidateGenerationControls.vue'

describe('CandidateGenerationControls', () => {
  it('disables generation until the note has a saved revision', () => {
    const wrapper = mount(CandidateGenerationControls, {
      props: {
        noteId: null,
        revision: null,
        status: 'idle',
        errorMessage: null,
        candidateNodeCount: 0,
      },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('请先保存笔记')
  })

  it('emits generate when a saved note can start compilation', async () => {
    const wrapper = mount(CandidateGenerationControls, {
      props: {
        noteId: 'note-1',
        revision: 2,
        status: 'idle',
        errorMessage: null,
        candidateNodeCount: 0,
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.emitted('generate')).toEqual([[]])
  })

  it('disables the button while generating and shows ready feedback afterwards', async () => {
    const wrapper = mount(CandidateGenerationControls, {
      props: {
        noteId: 'note-1',
        revision: 2,
        status: 'generating',
        errorMessage: null,
        candidateNodeCount: 0,
      },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在生成')

    await wrapper.setProps({ status: 'ready', candidateNodeCount: 3 })

    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('已生成 3 个候选节点')
    expect(wrapper.text()).toContain('请在审阅区接受')
    expect(wrapper.text()).toContain('图/大纲仍是确认模型')
  })

  it('surfaces generation errors and offers a retry label', () => {
    const wrapper = mount(CandidateGenerationControls, {
      props: {
        noteId: 'note-1',
        revision: 2,
        status: 'error',
        errorMessage: '候选模型必须绑定有效的 Note revision',
        candidateNodeCount: 0,
      },
    })

    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button').text()).toBe('重试生成候选模型')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '候选模型必须绑定有效的 Note revision',
    )
  })
})
