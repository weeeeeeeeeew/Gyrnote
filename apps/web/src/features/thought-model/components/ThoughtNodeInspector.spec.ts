import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { hashSourceQuote } from '@/features/source-anchors/domain/quote-hash'

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

  it('offers a lock action for unlocked nodes and emits lock', async () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: createNode({ reviewStatus: 'confirmed' }) },
    })

    const lockButton = wrapper.get('button[aria-label="锁定节点"]')
    expect(lockButton.text()).toBe('锁定')
    expect(lockButton.attributes('disabled')).toBeUndefined()

    await lockButton.trigger('click')
    expect(wrapper.emitted('lock')).toEqual([[]])
  })

  it('disables editing when locked and offers unlock instead of lock', async () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: { node: createNode({ reviewStatus: 'locked', text: '已锁定文本' }) },
    })

    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    const unlockButton = wrapper.get('button[aria-label="解锁节点"]')
    expect(unlockButton.text()).toBe('解锁')
    expect(unlockButton.attributes('disabled')).toBeUndefined()

    await unlockButton.trigger('click')
    expect(wrapper.emitted('unlock')).toEqual([[]])
  })

  it('emits delete for unlocked nodes and disables delete when locked', async () => {
    const unlocked = mount(ThoughtNodeInspector, {
      props: { node: createNode({ reviewStatus: 'confirmed' }) },
    })
    const deleteButton = unlocked.get('button[aria-label="删除节点"]')
    expect(deleteButton.attributes('disabled')).toBeUndefined()
    await deleteButton.trigger('click')
    expect(unlocked.emitted('delete')).toEqual([[]])

    const locked = mount(ThoughtNodeInspector, {
      props: { node: createNode({ reviewStatus: 'locked' }) },
    })
    expect(locked.get('button[aria-label="删除节点"]').attributes('disabled')).toBeDefined()
  })

  it('shows the quote associated with the selected node', () => {
    const wrapper = mount(ThoughtNodeInspector, {
      props: {
        node: createNode({ sourceAnchorIds: ['anchor-source'] }),
        sourceAnchor: {
          id: 'anchor-source',
          blockId: 'block-source',
          startOffset: 0,
          endOffset: 2,
          quote: '原文',
          quoteHash: hashSourceQuote('原文'),
        },
      },
    })

    expect(wrapper.text()).toContain('原文锚点')
    expect(wrapper.text()).toContain('“原文”')
  })
})

function createNode(overrides: Partial<ThoughtNode> = {}): ThoughtNode {
  return {
    id: 'claim-product-engineer',
    type: 'claim',
    label: null,
    text: '以复杂前端交互为锚，补齐全栈与 AI 应用能力。',
    origin: 'user_created',
    explicitness: 'explicit',
    reviewStatus: 'confirmed',
    confidence: null,
    sourceAnchorIds: [],
    ...overrides,
  }
}
