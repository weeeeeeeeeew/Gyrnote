<script setup lang="ts">
import { computed } from 'vue'
import {
  Handle,
  Position,
  VueFlow,
  type Connection,
  type EdgeMouseEvent,
  type NodeDragEvent,
  type NodeMouseEvent,
} from '@vue-flow/core'

import type { ThoughtModel } from '../domain/thought-model'
import {
  toVueFlowElements,
  type GraphEdgePathStyle,
  type GraphNodePosition,
} from '../adapters/vue-flow'

const props = withDefaults(
  defineProps<{
    model: ThoughtModel
    nodePositions?: Readonly<Record<string, GraphNodePosition>>
    edgePathStyle?: GraphEdgePathStyle
  }>(),
  {
    nodePositions: () => ({}),
    edgePathStyle: 'default',
  },
)

const emit = defineEmits<{
  selectNode: [nodeId: string]
  selectEdge: [edgeId: string]
  moveNode: [payload: { nodeId: string; position: GraphNodePosition }]
  connectNodes: [payload: { sourceNodeId: string; targetNodeId: string }]
}>()

const flowElements = computed(() =>
  toVueFlowElements(props.model, {
    nodePositions: props.nodePositions,
    edgePathStyle: props.edgePathStyle,
    nodesDraggable: true,
  }),
)
const flowNodes = computed(() => flowElements.value.nodes)
const flowEdges = computed(() => flowElements.value.edges)

function handleNodeClick(event: NodeMouseEvent) {
  emit('selectNode', event.node.id)
}

function handleEdgeClick(event: EdgeMouseEvent) {
  emit('selectEdge', event.edge.id)
}

function handleNodeDragStop(event: NodeDragEvent) {
  emit('moveNode', {
    nodeId: event.node.id,
    position: { x: event.node.position.x, y: event.node.position.y },
  })
}

function handleConnect(connection: Connection) {
  if (!connection.source || !connection.target || connection.source === connection.target) {
    return
  }
  emit('connectNodes', {
    sourceNodeId: connection.source,
    targetNodeId: connection.target,
  })
}
</script>

<template>
  <VueFlow
    class="thought-graph"
    :nodes="flowNodes"
    :edges="flowEdges"
    :nodes-draggable="true"
    :nodes-connectable="true"
    :edges-updatable="false"
    :fit-view-on-init="true"
    :min-zoom="0.4"
    :max-zoom="1.6"
    @node-click="handleNodeClick"
    @edge-click="handleEdgeClick"
    @node-drag-stop="handleNodeDragStop"
    @connect="handleConnect"
  >
    <template #node-thought="{ data, selected }">
      <article class="thought-node" :class="{ 'is-selected': selected }">
        <Handle
          class="thought-node__handle thought-node__handle--target"
          type="target"
          :position="Position.Left"
        />
        <span class="thought-node__type">{{ data.typeLabel }}</span>
        <p>{{ data.text }}</p>
        <span class="thought-node__status">{{ data.reviewStatus }}</span>
        <Handle
          class="thought-node__handle thought-node__handle--source"
          type="source"
          :position="Position.Right"
        />
      </article>
    </template>
  </VueFlow>
</template>

<style scoped>
.thought-graph {
  flex: 1;
  min-height: 360px;
  background:
    radial-gradient(circle at 1px 1px, #d8d6cb 1px, transparent 0) 0 0 / 22px 22px,
    #fffdf8;
}

.thought-node {
  position: relative;
  display: grid;
  width: 260px;
  min-height: 112px;
  align-content: start;
  gap: 8px;
  padding: 14px;
  border: 1px solid #cfd8cc;
  border-radius: 16px;
  color: #20251f;
  background: #ffffff;
  box-shadow: 0 12px 28px rgb(43 48 38 / 12%);
}

.thought-node.is-selected {
  border-color: #57735b;
  box-shadow:
    0 0 0 3px rgb(87 115 91 / 18%),
    0 14px 32px rgb(43 48 38 / 16%);
}

.thought-node__type,
.thought-node__status {
  width: fit-content;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.thought-node__type {
  padding: 3px 8px;
  color: #38523a;
  background: #e3eee0;
}

.thought-node__status {
  padding: 2px 7px;
  color: #777d73;
  background: #f3f0e8;
}

.thought-node p {
  line-height: 1.45;
}

.thought-node__handle {
  width: 10px;
  height: 10px;
  border: 2px solid #57735b;
  background: #ffffff;
}

.thought-node__handle--source {
  right: -6px;
}

.thought-node__handle--target {
  left: -6px;
}
</style>
