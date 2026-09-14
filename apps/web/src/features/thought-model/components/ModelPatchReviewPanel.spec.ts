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
  it('shows empty state and can request a fixture patch', async () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: null, feedback: null },
    })

    expect(wrapper.text()).toContain('尚无候选 patch')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('loadFixture')).toHaveLength(1)
  })

  it('can request a patch from current note anchors', async () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: null, feedback: null },
    })

    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('proposeFromNote')).toHaveLength(1)
  })

  it('lists ops and emits apply / dismiss', async () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: samplePatch, feedback: null, reviewStatus: 'awaiting_review' },
    })

    expect(wrapper.text()).toContain('update_node_text')
    expect(wrapper.text()).toContain('delete_node')
    expect(wrapper.text()).toContain('审阅 awaiting_review')
    const buttons = wrapper.findAll('button')
    await buttons[2]!.trigger('click')
    await buttons[3]!.trigger('click')
    expect(wrapper.emitted('apply')).toHaveLength(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('emits compileFromInstruction after the existing action buttons', async () => {
    const wrapper = mount(ModelPatchReviewPanel, {
      props: { patch: null, feedback: null },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(5)
    await wrapper.get('input').setValue('把论点改成结构必须回到笔记')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('compileFromInstruction')).toEqual([['把论点改成结构必须回到笔记']])
  })
})
