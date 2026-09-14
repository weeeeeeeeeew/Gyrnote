import type { Edge, Node } from '@vue-flow/core'
import { MarkerType, Position } from '@vue-flow/core'
import * as dagre from 'dagre'

import type { ThoughtEdge, ThoughtModel, ThoughtNode } from '../domain/thought-model'
import { displayThoughtTypeLabel } from '../domain/thought-model'

export const THOUGHT_FLOW_NODE_WIDTH = 260
export const THOUGHT_FLOW_NODE_HEIGHT = 112

/** Vue Flow built-in path styles. `default` = cubic bezier. */
export const GRAPH_EDGE_PATH_STYLES = ['default', 'smoothstep', 'straight'] as const
export type GraphEdgePathStyle = (typeof GRAPH_EDGE_PATH_STYLES)[number]

export interface GraphNodePosition {
  x: number
  y: number
}

export interface ToVueFlowElementsOptions {
  /** Pinia-owned layout overrides; missing ids fall back to Dagre. */
  nodePositions?: Readonly<Record<string, GraphNodePosition>>
  edgePathStyle?: GraphEdgePathStyle
  nodesDraggable?: boolean
}

export interface ThoughtFlowNodeData {
  thoughtNodeId: string
  nodeType: ThoughtNode['type']
  typeLabel: string
  text: string
  reviewStatus: ThoughtNode['reviewStatus']
}

export interface ThoughtFlowEdgeData {
  thoughtEdgeId: string
  edgeType: ThoughtEdge['type']
  typeLabel: string
  reviewStatus: ThoughtEdge['reviewStatus']
}

export type ThoughtFlowNode = Node<ThoughtFlowNodeData, Record<string, never>, 'thought'>
export type ThoughtFlowEdge = Edge<
  ThoughtFlowEdgeData,
  Record<string, never>,
  GraphEdgePathStyle
>

export interface ThoughtFlowElements {
  nodes: ThoughtFlowNode[]
  edges: ThoughtFlowEdge[]
}

export function toVueFlowElements(
  model: ThoughtModel,
  options: ToVueFlowElementsOptions = {},
): ThoughtFlowElements {
  const nodePositions = options.nodePositions ?? {}
  const edgePathStyle = options.edgePathStyle ?? 'default'
  const nodesDraggable = options.nodesDraggable ?? true
  const layoutPositions = computeDagrePositions(model)

  return {
    nodes: model.nodes.map((node) =>
      toVueFlowNode(node, nodePositions[node.id] ?? layoutPositions[node.id]!, nodesDraggable),
    ),
    edges: model.edges.map((edge) => toVueFlowEdge(edge, edgePathStyle)),
  }
}

function computeDagrePositions(model: ThoughtModel): Record<string, GraphNodePosition> {
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

  const positions: Record<string, GraphNodePosition> = {}
  for (const node of model.nodes) {
    const layoutNode = graph.node(node.id)
    positions[node.id] = {
      x: layoutNode.x - THOUGHT_FLOW_NODE_WIDTH / 2,
      y: layoutNode.y - THOUGHT_FLOW_NODE_HEIGHT / 2,
    }
  }
  return positions
}

function toVueFlowNode(
  node: ThoughtNode,
  position: GraphNodePosition,
  draggable: boolean,
): ThoughtFlowNode {
  return {
    id: node.id,
    type: 'thought',
    position: { ...position },
    width: THOUGHT_FLOW_NODE_WIDTH,
    height: THOUGHT_FLOW_NODE_HEIGHT,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable,
    connectable: true,
    data: {
      thoughtNodeId: node.id,
      nodeType: node.type,
      typeLabel: displayThoughtTypeLabel(node.type, node.label),
      text: node.text,
      reviewStatus: node.reviewStatus,
    },
  }
}

function toVueFlowEdge(edge: ThoughtEdge, pathStyle: GraphEdgePathStyle): ThoughtFlowEdge {
  const typeLabel = displayThoughtTypeLabel(edge.type, edge.label)
  return {
    id: edge.id,
    type: pathStyle,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: typeLabel,
    markerEnd: MarkerType.ArrowClosed,
    data: {
      thoughtEdgeId: edge.id,
      edgeType: edge.type,
      typeLabel,
      reviewStatus: edge.reviewStatus,
    },
  }
}
