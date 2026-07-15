import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { ThoughtEdge } from '../domain/thought-model'
import ThoughtEdgeInspector from './ThoughtEdgeInspector.vue'

describe('ThoughtEdgeInspector', () => {
  it('renders the directed endpoints and edge metadata', () => {
    const wrapper = mount(ThoughtEdgeInspector, {
      props: {
        edge: createEdge(),
        sourceText: '证据节点',
        targetText: '结论节点',
      },
    })

    expect(wrapper.text()).toContain('证据节点')
    expect(wrapper.text()).toContain('结论节点')
    expect(wrapper.text()).toContain('user_created')
  })

  it('initializes the local draft from the selected edge', () => {
    const wrapper = mount(ThoughtEdgeInspector, {
      props: {
        edge: createEdge({ type: 'challenges' }),
        sourceText: '证据节点',
        targetText: '结论节点',
      },
    })

    expect(wrapper.get('select').element.value).toBe('challenges')
  })

  it('synchronizes the draft when the selected edge changes', async () => {
    const wrapper = mount(ThoughtEdgeInspector, {
      props: {
        edge: createEdge({ id: 'edge-a', type: 'supports' }),
        sourceText: '节点 A',
        targetText: '节点 B',
      },
    })

    await wrapper.get('select').setValue('answers')
    await wrapper.setProps({ edge: createEdge({ id: 'edge-b', type: 'depends_on' }) })

    expect(wrapper.get('select').element.value).toBe('depends_on')
  })

  it('only enables save when the relationship type changes', async () => {
    const wrapper = mount(ThoughtEdgeInspector, {
      props: {
        edge: createEdge({ type: 'supports' }),
        sourceText: '证据节点',
        targetText: '结论节点',
      },
    })
    const saveButton = wrapper.get('button[type="submit"]')

    expect(saveButton.attributes('disabled')).toBeDefined()

    await wrapper.get('select').setValue('qualifies')
    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('emits the changed relationship type after submission', async () => {
    const wrapper = mount(ThoughtEdgeInspector, {
      props: {
        edge: createEdge({ type: 'supports' }),
        sourceText: '证据节点',
        targetText: '结论节点',
      },
    })

    await wrapper.get('select').setValue('qualifies')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('save')).toEqual([['qualifies']])
  })
})

function createEdge(overrides: Partial<ThoughtEdge> = {}): ThoughtEdge {
  return {
    id: 'edge-evidence-supports-claim',
    sourceNodeId: 'evidence-shared-workflow',
    targetNodeId: 'claim-product-engineer',
    type: 'supports',
    origin: 'user_created',
    explicitness: 'explicit',
    reviewStatus: 'confirmed',
    confidence: null,
    ...overrides,
  }
}
