import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { renderTeleportStub } from '@/test-support/teleport-stub'
import type { ThoughtNode } from '../domain/thought-model'
import CorrectionToolkit from './CorrectionToolkit.vue'

describe('CorrectionToolkit', () => {
  const nodes: ThoughtNode[] = [
    {
      id: 'node-a',
      type: 'claim',
      label: null,
      text: '主张 A',
      origin: 'user_created',
      explicitness: 'explicit',
      reviewStatus: 'confirmed',
      confidence: null,
      sourceAnchorIds: [],
    },
    {
      id: 'node-b',
      type: 'evidence',
      label: null,
      text: '证据 B',
      origin: 'user_created',
      explicitness: 'explicit',
      reviewStatus: 'confirmed',
      confidence: null,
      sourceAnchorIds: [],
    },
  ]

  it('emits createNode with type and text', async () => {
    const wrapper = mount(CorrectionToolkit, {
      props: { nodes },
      global: { stubs: renderTeleportStub },
    })

    await wrapper.get('.correction-toolkit__toggle').trigger('click')
    expect(wrapper.get('.correction-toolkit__toggle').text()).toBe('新建')
    await wrapper.get('[aria-label="新建节点类型"]').setValue('observation')
    await wrapper.get('[aria-label="新建节点文本"]').setValue('  手工观察  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('createNode')).toEqual([
      [{ type: 'observation', text: '  手工观察  ', label: null }],
    ])
  })

  it('keeps the create button labeled 新建 after the dialog opens', async () => {
    const wrapper = mount(CorrectionToolkit, {
      props: { nodes },
      global: { stubs: renderTeleportStub },
    })

    expect(wrapper.get('.correction-toolkit__toggle').text()).toBe('新建')
    await wrapper.get('.correction-toolkit__toggle').trigger('click')
    expect(wrapper.get('.correction-toolkit__toggle').text()).toBe('新建')
    expect(wrapper.text()).toContain('主张')
    expect(wrapper.text()).toContain('支持')
  })

  it('emits createEdge when both endpoints differ', async () => {
    const wrapper = mount(CorrectionToolkit, {
      props: { nodes },
      global: { stubs: renderTeleportStub },
    })
    await wrapper.get('.correction-toolkit__toggle').trigger('click')
    const forms = wrapper.findAll('form')

    await wrapper.get('[aria-label="关系起点"]').setValue('node-a')
    await wrapper.get('[aria-label="新建关系类型"]').setValue('supports')
    await wrapper.get('[aria-label="关系终点"]').setValue('node-b')
    await forms[1]!.trigger('submit')

    expect(wrapper.emitted('createEdge')).toEqual([
      [{ sourceNodeId: 'node-a', targetNodeId: 'node-b', type: 'supports', label: null }],
    ])
  })
})
