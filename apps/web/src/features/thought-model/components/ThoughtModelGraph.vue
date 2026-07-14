<script setup lang="ts">
import { computed } from 'vue'
import { VueFlow, type EdgeMouseEvent, type NodeMouseEvent } from '@vue-flow/core'

import type { ThoughtModel } from '../domain/thought-model'
import { toVueFlowElements } from '../adapters/vue-flow'

const props = defineProps<{
  model: ThoughtModel
}>()

const emit = defineEmits<{
  selectNode: [nodeId: string]
  selectEdge: [edgeId: string]
}>()

const flowElements = computed(() => toVueFlowElements(props.model))
const flowNodes = computed(() => flowElements.value.nodes)
const flowEdges = computed(() => flowElements.value.edges)

function handleNodeClick(event: NodeMouseEvent) {
  emit('selectNode', event.node.id)
}

function handleEdgeClick(event: EdgeMouseEvent) {
  emit('selectEdge', event.edge.id)
}
</script>

<template>
  <VueFlow
    class="thought-graph"
    :nodes="flowNodes"
    :edges="flowEdges"
    :nodes-draggable="false"
    :nodes-connectable="false"
    :edges-updatable="false"
    :fit-view-on-init="true"
    :min-zoom="0.4"
    :max-zoom="1.6"
    @node-click="handleNodeClick"
    @edge-click="handleEdgeClick"
  >
    <template #node-thought="{ data, selected }">
      <article class="thought-node" :class="{ 'is-selected': selected }">
        <span class="thought-node__type">{{ data.nodeType }}</span>
        <p>{{ data.text }}</p>
        <span class="thought-node__status">{{ data.reviewStatus }}</span>
      </article>
    </template>
  </VueFlow>
</template>

<style scoped>
.thought-graph {
  min-height: 620px;
  background:
    radial-gradient(circle at 1px 1px, #d8d6cb 1px, transparent 0) 0 0 / 22px 22px,
    #fffdf8;
}

.thought-node {
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
</style>
