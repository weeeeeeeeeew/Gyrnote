import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { renderTeleportStub } from '@/test-support/teleport-stub'

import type { CandidateThoughtModel } from '../domain/thought-model'

import CandidateReviewPanel from './CandidateReviewPanel.vue'

describe('CandidateReviewPanel', () => {
  it('shows an empty state before any candidate exists', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: { candidate: null },
    })

    expect(wrapper.text()).toContain('尚未生成候选')
    expect(wrapper.text()).toContain('可直接首次编译')
    expect(wrapper.find('[aria-label="候选节点"]').exists()).toBe(false)
  })

  it('shows proposed anchor count in the candidate meta', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: {
        candidate: createCandidate({
          proposedAnchors: [
            {
              id: 'proposed-1',
              blockId: 'block-1',
              quote: '证据',
              startOffset: 0,
              endOffset: 2,
            },
          ],
        }),
      },
    })

    expect(wrapper.text()).toContain('提议锚点 1')
  })

  it('explains an empty candidate that has no pending items', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: { candidate: createCandidate({ nodes: [], edges: [] }) },
    })

    expect(wrapper.text()).toContain('本轮待审阅项已清空')
    expect(wrapper.find('[aria-label="候选节点"]').exists()).toBe(false)
  })

  it('still lists candidate edges after all candidate nodes are gone', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: {
        candidate: createCandidate({
          nodes: [],
        }),
      },
    })

    expect(wrapper.text()).toContain('待审阅节点已清空')
    expect(wrapper.find('[aria-label="候选关系"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="接受候选关系 candidate-edge-supports-1"]').exists()).toBe(true)
  })

  it('offers per-item accept plus bulk accept that still refuses confirmed-model overwrite copy', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: { candidate: createCandidate() },
    })

    expect(wrapper.text()).toContain('不会整表覆盖确认模型')
    expect(wrapper.text()).not.toMatch(/整表写入|直接覆盖确认模型/)
    expect(wrapper.text()).toContain('批准应用')
    expect(wrapper.find('[aria-label="接受候选节点 candidate-observation-1"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="接受候选关系 candidate-edge-supports-1"]').exists()).toBe(true)
  })

  it('renders each candidate node with type, text, source anchor and confidence (M3 checkpoint)', async () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: {
        candidate: createCandidate({
          nodes: [
            {
              id: 'candidate-1',
              type: 'observation',
              text: '原文观察',
              sourceAnchorIds: ['anchor-1'],
              confidence: 0.72,
            },
            {
              id: 'candidate-2',
              type: 'claim',
              text: '候选主张',
              sourceAnchorIds: ['anchor-2'],
              confidence: 0.55,
            },
          ],
          edges: [],
        }),
      },
    })

    const items = wrapper.findAll('[aria-label="候选节点"] li')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('observation')
    expect(items[0]?.text()).toContain('原文观察')
    expect(items[1]?.text()).toContain('claim')
    expect(items[1]?.text()).toContain('候选主张')

    await wrapper.get('[aria-label="查看候选节点 candidate-1"]').trigger('click')
    expect(wrapper.text()).toContain('anchor-1')
    expect(wrapper.text()).toContain('0.72')
  })

  it('renders each candidate edge with type, endpoints and confidence', async () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: { candidate: createCandidate() },
    })

    const items = wrapper.findAll('[aria-label="候选关系"] li')
    expect(items).toHaveLength(1)
    expect(items[0]?.text()).toContain('supports')
    expect(items[0]?.text()).toContain('candidate-observation-1 → candidate-claim-1')
    await wrapper.get('[aria-label="查看候选关系 candidate-edge-supports-1"]').trigger('click')
    expect(wrapper.text()).toContain('0.6')
  })

  it('emits acceptNode with the candidate node id when Accept is clicked', async () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: {
        candidate: createCandidate({
          nodes: [
            {
              id: 'candidate-1',
              type: 'observation',
              text: '原文观察',
              sourceAnchorIds: ['anchor-1'],
              confidence: 0.72,
            },
            {
              id: 'candidate-2',
              type: 'claim',
              text: '候选主张',
              sourceAnchorIds: ['anchor-2'],
              confidence: 0.55,
            },
          ],
        }),
      },
    })

    await wrapper.get('[aria-label="接受候选节点 candidate-2"]').trigger('click')

    expect(wrapper.emitted('acceptNode')).toEqual([['candidate-2']])
  })

  it('emits acceptEdge with the candidate edge id when Accept is clicked', async () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: { candidate: createCandidate() },
    })

    await wrapper.get('[aria-label="接受候选关系 candidate-edge-supports-1"]').trigger('click')

    expect(wrapper.emitted('acceptEdge')).toEqual([['candidate-edge-supports-1']])
  })

  it('marks accepted nodes and shows accept feedback', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: {
        candidate: createCandidate(),
        confirmedNodeIds: ['candidate-observation-1'],
        acceptFeedback: '请先接受关系的终点节点',
      },
    })

    const nodeButton = wrapper.get('[aria-label="接受候选节点 candidate-observation-1"]')
    expect(nodeButton.text()).toBe('已接受')
    expect(nodeButton.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('请先接受关系的终点节点')
  })

  it('keeps accept feedback in a sticky banner class for scroll visibility', () => {
    const wrapper = mount(CandidateReviewPanel, {
      global: { stubs: renderTeleportStub },
      props: {
        candidate: createCandidate(),
        acceptFeedback: '请先接受关系的终点节点',
      },
    })

    expect(wrapper.get('.candidate-review__feedback').text()).toContain('请先接受关系的终点节点')
  })
})

function createCandidate(
  overrides: Partial<CandidateThoughtModel> = {},
): CandidateThoughtModel {
  return {
    id: 'candidate-note-1-1',
    noteId: 'note-1',
    sourceRevision: 1,
    title: '固定 fixture 候选模型',
    proposedAnchors: [],
    nodes: [
      {
        id: 'candidate-observation-1',
        type: 'observation',
        text: '原文片段',
        sourceAnchorIds: ['anchor-1'],
        confidence: 0.72,
      },
      {
        id: 'candidate-claim-1',
        type: 'claim',
        text: '基于原文的主张：原文片段',
        sourceAnchorIds: ['anchor-1'],
        confidence: 0.55,
      },
    ],
    edges: [
      {
        id: 'candidate-edge-supports-1',
        sourceNodeId: 'candidate-observation-1',
        targetNodeId: 'candidate-claim-1',
        type: 'supports',
        sourceAnchorIds: ['anchor-1'],
        confidence: 0.6,
      },
    ],
    ...overrides,
  }
}
