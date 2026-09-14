import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { hashSourceQuote } from '../domain/quote-hash'
import type { IdentifiedSourceAnchor } from '../domain/source-anchor'
import { sampleNoteContent } from '../fixtures/sample-note-content'
import NoteEditor from './NoteEditor.vue'

describe('NoteEditor', () => {
  it('disables source commands when no ThoughtNode or anchor is active', () => {
    const wrapper = mount(NoteEditor, {
      props: {
        content: sampleNoteContent,
        canAttachSource: false,
        activeSourceAnchor: null,
      },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.attributes('disabled')).toBeDefined()
    expect(buttons[1]?.attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('locates an active source anchor in the current editor document', async () => {
    const quote = '原文块拥有稳定身份'
    const anchor: IdentifiedSourceAnchor = {
      id: 'anchor-intro',
      blockId: 'block-intro-anchor',
      startOffset: 9,
      endOffset: 18,
      quote,
      quoteHash: hashSourceQuote(quote),
    }
    const wrapper = mount(NoteEditor, {
      attachTo: document.body,
      props: {
        content: sampleNoteContent,
        canAttachSource: true,
        activeSourceAnchor: anchor,
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain(`已定位原文：“${quote}”`)
    })

    wrapper.unmount()
  })

  it('does not mark a server-loaded document as a user edit', async () => {
    const wrapper = mount(NoteEditor, {
      props: {
        content: sampleNoteContent,
        canAttachSource: false,
        activeSourceAnchor: null,
      },
    })
    const initialUpdateCount = wrapper.emitted('update')?.length ?? 0

    await wrapper.setProps({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '从服务端恢复的原文' }] }],
      },
    })

    expect(wrapper.emitted('update')?.length ?? 0).toBe(initialUpdateCount)
    wrapper.unmount()
  })
})
