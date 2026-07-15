import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ThoughtNode } from '../domain/thought-model'
import ThoughtNodeInspector from './ThoughtNodeInspector.vue'

describe('ThoughtNodeInspector', () => {
  it('renders an empty state when no node is selected', () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: null },
    })

    expect(wrapper.text()).toContain('选择一个节点')
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('initializes the local draft from the selected node', () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: createNode({ text: '原始文本' }) },
    })

    expect(wrapper.get('textarea').element.value).toBe('原始文本')
  })

  it('synchronizes the draft when the selected node changes', async () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: createNode({ id: 'node-a', text: '节点 A' }) },
    })

    await wrapper.get('textarea').setValue('尚未保存的草稿')
    await wrapper.setProps({ node: createNode({ id: 'node-b', text: '节点 B' }) })

    expect(wrapper.get('textarea').element.value).toBe('节点 B')
  })

  it('only enables save for a non-blank changed draft', async () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: createNode({ text: '原始文本' }) },
    })
    const textarea = wrapper.get('textarea')
    const saveButton = wrapper.get('button[type="submit"]')

    expect(saveButton.attributes('disabled')).toBeDefined()

    await textarea.setValue('   ')
    expect(saveButton.attributes('disabled')).toBeDefined()

    await textarea.setValue('  原始文本  ')
    expect(saveButton.attributes('disabled')).toBeDefined()

    await textarea.setValue('修改后的文本')
    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('emits the draft through the save event after submission', async () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: createNode({ text: '原始文本' }) },
    })

    await wrapper.get('textarea').setValue('修改后的文本')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toEqual([['修改后的文本']])
  })
})

function createNode(overrides: Partial<ThoughtNode> = {}): ThoughtNode {
  return {
    id: 'claim-product-engineer',
    type: 'claim',
    text: '以复杂前端交互为锚，补齐全栈与 AI 应用能力。',
    origin: 'user_created',
    explicitness: 'explicit',
    reviewStatus: 'confirmed',
    confidence: null,
    sourceAnchorId: null,
    ...overrides,
  }
}
