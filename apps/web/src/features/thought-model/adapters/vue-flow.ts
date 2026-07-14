import type { Edge, Node } from '@vue-flow/core'
import { MarkerType, Position } from '@vue-flow/core'
import * as dagre from 'dagre'

import type { ThoughtEdge, ThoughtModel, ThoughtNode } from '../domain/thought-model'

export const THOUGHT_FLOW_NODE_WIDTH = 260
export const THOUGHT_FLOW_NODE_HEIGHT = 112

export interface ThoughtFlowNodeData {
  thoughtNodeId: string
  nodeType: ThoughtNode['type']
  text: string
  reviewStatus: ThoughtNode['reviewStatus']
}

export interface ThoughtFlowEdgeData {
  thoughtEdgeId: string
  edgeType: ThoughtEdge['type']
  reviewStatus: ThoughtEdge['reviewStatus']
}

export type ThoughtFlowNode = Node<ThoughtFlowNodeData, Record<string, never>, 'thought'>
export type ThoughtFlowEdge = Edge<ThoughtFlowEdgeData, Record<string, never>, 'smoothstep'>

export interface ThoughtFlowElements {
  nodes: ThoughtFlowNode[]
  edges: ThoughtFlowEdge[]
}

export function toVueFlowElements(model: ThoughtModel): ThoughtFlowElements {
  const graph = new dagre.graphlib.Graph()

  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 56,
    ranksep: 96,
    marginx: 24,
    marginy: 24,
  })

  for (const node of model.nodes) {
    graph.setNode(node.id, {
      width: THOUGHT_FLOW_NODE_WIDTH,
      height: THOUGHT_FLOW_NODE_HEIGHT,
    })
  }

  for (const edge of model.edges) {
    graph.setEdge(edge.sourceNodeId, edge.targetNodeId)
  }

  dagre.layout(graph)

  return {
    nodes: model.nodes.map((node) => toVueFlowNode(node, graph.node(node.id))),
    edges: model.edges.map(toVueFlowEdge),
  }
}

function toVueFlowNode(node: ThoughtNode, layoutNode: dagre.Node): ThoughtFlowNode {
  return {
    id: node.id,
    type: 'thought',
    position: {
      x: layoutNode.x - THOUGHT_FLOW_NODE_WIDTH / 2,
      y: layoutNode.y - THOUGHT_FLOW_NODE_HEIGHT / 2,
    },
    width: THOUGHT_FLOW_NODE_WIDTH,
    height: THOUGHT_FLOW_NODE_HEIGHT,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable: false,
    data: {
      thoughtNodeId: node.id,
      nodeType: node.type,
      text: node.text,
      reviewStatus: node.reviewStatus,
    },
  }
}

function toVueFlowEdge(edge: ThoughtEdge): ThoughtFlowEdge {
  return {
    id: edge.id,
    type: 'smoothstep',
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.type,
    markerEnd: MarkerType.ArrowClosed,
    data: {
      thoughtEdgeId: edge.id,
      edgeType: edge.type,
      reviewStatus: edge.reviewStatus,
    },
  }
}
