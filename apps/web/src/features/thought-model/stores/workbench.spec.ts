import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useThoughtModelWorkbenchStore } from './workbench'

describe('useThoughtModelWorkbenchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not update node text when no node is selected', () => {
    const workbench = useThoughtModelWorkbenchStore()
    const originalText = getNodeText(workbench, 'claim-product-engineer')

    expect(workbench.updateSelectedNodeText('新的项目定位')).toBe(false)
    expect(getNodeText(workbench, 'claim-product-engineer')).toBe(originalText)
  })

  it('does not update node text with blank input', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')
    const originalText = getNodeText(workbench, 'claim-product-engineer')

    expect(workbench.updateSelectedNodeText('   ')).toBe(false)
    expect(getNodeText(workbench, 'claim-product-engineer')).toBe(originalText)
  })

  it('updates the selected ThoughtNode text in the domain model', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')

    expect(workbench.updateSelectedNodeText('以可解释的复杂前端交互为项目锚点')).toBe(true)
    expect(getNodeText(workbench, 'claim-product-engineer')).toBe(
      '以可解释的复杂前端交互为项目锚点',
    )
    expect(workbench.selectedNode?.text).toBe('以可解释的复杂前端交互为项目锚点')
  })

  it('keeps node and edge selection mutually exclusive', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')
    expect(workbench.selectedNode?.id).toBe('claim-product-engineer')
    expect(workbench.selectedEdge).toBeNull()

    workbench.selectEdge('edge-evidence-supports-claim')
    expect(workbench.selectedNode).toBeNull()
    expect(workbench.selectedEdge?.id).toBe('edge-evidence-supports-claim')
  })

  it('does not update an edge type when no edge is selected', () => {
    const workbench = useThoughtModelWorkbenchStore()

    expect(workbench.updateSelectedEdgeType('challenges')).toBe(false)
    expect(getEdgeType(workbench, 'edge-evidence-supports-claim')).toBe('supports')
  })

  it('does not update an edge when its type is unchanged', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectEdge('edge-evidence-supports-claim')

    expect(workbench.updateSelectedEdgeType('supports')).toBe(false)
    expect(getEdgeType(workbench, 'edge-evidence-supports-claim')).toBe('supports')
  })

  it('updates only the selected ThoughtEdge type in the domain model', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectEdge('edge-evidence-supports-claim')

    expect(workbench.updateSelectedEdgeType('challenges')).toBe(true)
    expect(getEdgeType(workbench, 'edge-evidence-supports-claim')).toBe('challenges')
    expect(getEdgeType(workbench, 'edge-claim-answers-question')).toBe('answers')
    expect(workbench.selectedEdge?.type).toBe('challenges')
  })
})

function getNodeText(
  workbench: ReturnType<typeof useThoughtModelWorkbenchStore>,
  nodeId: string,
): string {
  const node = workbench.model.nodes.find((candidate) => candidate.id === nodeId)

  if (!node) {
    throw new Error(`Missing ThoughtNode: ${nodeId}`)
  }

  return node.text
}

function getEdgeType(
  workbench: ReturnType<typeof useThoughtModelWorkbenchStore>,
  edgeId: string,
): string {
  const edge = workbench.model.edges.find((candidate) => candidate.id === edgeId)

  if (!edge) {
    throw new Error(`Missing ThoughtEdge: ${edgeId}`)
  }

  return edge.type
}
