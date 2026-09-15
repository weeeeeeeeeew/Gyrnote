import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { ModelPatch } from '../domain/model-patch'
import ModelPatchReviewPanel from './ModelPatchReviewPanel.vue'

const samplePatch: ModelPatch = {
  id: 'patch-1',
  noteId: 'note-1',
  baseModelVersion: 1,
  reason: 'demo',
  ops: [
    { op: 'update_node_text', nodeId: 'n1', text: '新文案' },
    { op: 'delete_node', nodeId: 'n2' },
  ],
}

describe('ModelPatchReviewPanel', () => {
  it('shows empty state without a fixture loader', () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: null, feedback: null },
    })

    expect(wrapper.text()).toContain('尚无候选 patch')
    expect(wrapper.text()).not.toContain('加载 fixture patch')
    expect(wrapper.findAll('button')).toHaveLength(1)
  })

  it('can request a patch from current note anchors', async () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: null, feedback: null },
    })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('proposeFromNote')).toHaveLength(1)
  })

  it('lists ops and emits acceptOp for a single row', async () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: samplePatch, feedback: null },
    })

    expect(wrapper.text()).toContain('update_node_text')
    expect(wrapper.text()).toContain('delete_node')
    expect(wrapper.text()).not.toContain('审阅')
    expect(wrapper.findAll('button')).toHaveLength(3)

    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('acceptOp')).toEqual([[0]])
  })
})
