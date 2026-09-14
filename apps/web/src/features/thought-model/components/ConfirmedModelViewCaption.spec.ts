import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ConfirmedModelViewCaption from './ConfirmedModelViewCaption.vue'

describe('ConfirmedModelViewCaption', () => {
  it('states that graph/outline show only the confirmed model', () => {
    const wrapper = mount(ConfirmedModelViewCaption, {
      props: { hasCandidate: false },
    })

    expect(wrapper.text()).toContain('确认模型')
    expect(wrapper.text()).toContain('图/大纲只显示已接受结构')
    expect(wrapper.text()).toContain('生成候选不会自动改这里')
  })

  it('points users to the candidate tab when a candidate is ready', () => {
    const wrapper = mount(ConfirmedModelViewCaption, {
      props: { hasCandidate: true },
    })

    expect(wrapper.text()).toContain('候选模型')
    expect(wrapper.text()).toContain('Tab')
    expect(wrapper.text()).not.toContain('生成候选不会自动改这里')
  })
})
