import { describe, expect, it } from 'vitest'

import { sampleThoughtModel } from '../fixtures/sample-thought-model'
import { THOUGHT_FLOW_NODE_HEIGHT, THOUGHT_FLOW_NODE_WIDTH, toVueFlowElements } from './vue-flow'

describe('toVueFlowElements', () => {
  it('keeps ThoughtModel identity and business fields in Vue Flow data', () => {
    const { nodes, edges } = toVueFlowElements(sampleThoughtModel)

    expect(nodes).toHaveLength(sampleThoughtModel.nodes.length)
    expect(edges).toHaveLength(sampleThoughtModel.edges.length)

    const questionNode = nodes.find((node) => node.id === 'question-direction')

    if (!questionNode) {
      throw new Error('question-direction node was not mapped')
    }

    expect(questionNode.type).toBe('thought')
    expect(questionNode.data).toEqual({
      thoughtNodeId: 'question-direction',
      nodeType: 'question',
      typeLabel: 'question',
      text: '两个月内应该怎样组织秋招项目？',
      reviewStatus: 'confirmed',
    })
  })

  it('derives view positions from Dagre when Pinia has no overrides', () => {
    const { nodes } = toVueFlowElements(sampleThoughtModel)

    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
      expect(node.width).toBe(THOUGHT_FLOW_NODE_WIDTH)
      expect(node.height).toBe(THOUGHT_FLOW_NODE_HEIGHT)
      expect(node.draggable).toBe(true)
      expect(node.connectable).toBe(true)
    }
  })

  it('prefers Pinia-owned position overrides over Dagre', () => {
    const { nodes } = toVueFlowElements(sampleThoughtModel, {
      nodePositions: {
        'question-direction': { x: 12, y: 34 },
      },
    })
    const questionNode = nodes.find((node) => node.id === 'question-direction')
    expect(questionNode?.position).toEqual({ x: 12, y: 34 })
  })

  it('maps ThoughtEdge endpoints and applies the selected path style', () => {
    const { edges } = toVueFlowElements(sampleThoughtModel, { edgePathStyle: 'straight' })
    const supportsEdge = edges.find((edge) => edge.id === 'edge-evidence-supports-claim')

    if (!supportsEdge) {
      throw new Error('edge-evidence-supports-claim edge was not mapped')
    }

    expect(supportsEdge.source).toBe('evidence-shared-workflow')
    expect(supportsEdge.target).toBe('claim-product-engineer')
    expect(supportsEdge.type).toBe('straight')
    expect(supportsEdge.label).toBe('supports')
    expect(supportsEdge.data).toEqual({
      thoughtEdgeId: 'edge-evidence-supports-claim',
      edgeType: 'supports',
      typeLabel: 'supports',
      reviewStatus: 'confirmed',
    })
  })
})
