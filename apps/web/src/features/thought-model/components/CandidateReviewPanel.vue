<script setup lang="ts">
import { computed } from 'vue'

import type { CandidateThoughtModel } from '../domain/thought-model'
import { displayThoughtTypeLabel } from '../domain/thought-model'

const props = defineProps<{
  candidate: CandidateThoughtModel | null
  confirmedNodeIds?: string[]
  confirmedEdgeIds?: string[]
  acceptFeedback?: string | null
}>()

const emit = defineEmits<{
  acceptNode: [candidateNodeId: string]
  acceptEdge: [candidateEdgeId: string]
}>()

const confirmedNodeIdSet = computed(() => new Set(props.confirmedNodeIds ?? []))
const confirmedEdgeIdSet = computed(() => new Set(props.confirmedEdgeIds ?? []))

function isNodeAccepted(nodeId: string): boolean {
  return confirmedNodeIdSet.value.has(nodeId)
}

function isEdgeAccepted(edgeId: string): boolean {
  return confirmedEdgeIdSet.value.has(edgeId)
}
</script>

<template>
  <section class="candidate-review" aria-label="候选模型审阅">
    <header class="candidate-review__header">
      <h2>候选模型（待审阅）</h2>
      <p class="candidate-review__hint">
        候选只在此列表（接受后会从这里移除）。切换到「确认模型」查看图/大纲；不会整表覆盖。
      </p>
    </header>

    <p
      v-if="acceptFeedback"
      class="candidate-review__feedback"
      role="status"
      aria-live="polite"
    >
      {{ acceptFeedback }}
    </p>

    <p v-if="!candidate" class="candidate-review__empty">
      尚未生成候选。保存笔记后可直接首次编译；也可先手动画锚点再生成。
    </p>

    <template v-else>
      <p class="candidate-review__meta">
        {{ candidate.title }} · revision {{ candidate.sourceRevision }} · 待审阅
        {{ candidate.nodes.length }} 个节点 · {{ candidate.edges.length }} 条关系
        · 提议锚点 {{ candidate.proposedAnchors.length }}
      </p>

      <p
        v-if="candidate.nodes.length === 0 && candidate.edges.length === 0"
        class="candidate-review__empty"
      >
        本轮待审阅项已清空；已接受内容在下方确认模型中。
      </p>

      <template v-else>
        <p v-if="candidate.nodes.length === 0" class="candidate-review__empty">
          待审阅节点已清空（已接受的在确认模型中）。
        </p>
        <ol v-else class="candidate-review__list" aria-label="候选节点">
          <li v-for="node in candidate.nodes" :key="node.id">
            <span class="node-type">{{ displayThoughtTypeLabel(node.type, node.label) }}</span>
            <span>{{ node.text }}</span>
            <span class="anchor-id">{{ node.sourceAnchorIds.join(', ') }}</span>
            <span class="confidence">{{ node.confidence }}</span>
            <button
              type="button"
              class="accept-action"
              :aria-label="`接受候选节点 ${node.id}`"
              :disabled="isNodeAccepted(node.id)"
              @click="emit('acceptNode', node.id)"
            >
              {{ isNodeAccepted(node.id) ? '已接受' : '接受' }}
            </button>
          </li>
        </ol>

        <h3 class="candidate-review__subheader">候选关系</h3>
        <p v-if="candidate.edges.length === 0" class="candidate-review__empty">
          待审阅关系已清空（或本轮没有关系）。
        </p>
        <ol v-else class="candidate-review__list" aria-label="候选关系">
          <li v-for="edge in candidate.edges" :key="edge.id">
            <span class="node-type">{{ displayThoughtTypeLabel(edge.type, edge.label) }}</span>
            <span>{{ edge.sourceNodeId }} → {{ edge.targetNodeId }}</span>
            <span class="confidence">{{ edge.confidence }}</span>
            <button
              type="button"
              class="accept-action"
              :aria-label="`接受候选关系 ${edge.id}`"
              :disabled="isEdgeAccepted(edge.id)"
              @click="emit('acceptEdge', edge.id)"
            >
              {{ isEdgeAccepted(edge.id) ? '已接受' : '接受' }}
            </button>
          </li>
        </ol>
      </template>
    </template>
  </section>
</template>

<style scoped>
.candidate-review {
  padding: 20px 28px 8px;
  border-bottom: 1px solid #deddd4;
  background: #f7f3ea;
}

.candidate-review__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.candidate-review__header h2 {
  margin: 0;
  font-size: 16px;
}

.candidate-review__subheader {
  margin: 4px 0 10px;
  font-size: 14px;
}

.candidate-review__hint,
.candidate-review__meta,
.candidate-review__empty,
.candidate-review__feedback {
  margin: 0;
  color: #687064;
  font-size: 13px;
}

.candidate-review__feedback {
  position: sticky;
  top: 0;
  z-index: 2;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #b7c9da;
  border-radius: 8px;
  color: #2f4f6f;
  background: #e4eef6;
  box-shadow: 0 6px 16px rgb(47 79 111 / 12%);
}

.candidate-review__meta {
  margin-bottom: 12px;
}

.candidate-review__list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0 0 12px;
  list-style: none;
}

.candidate-review__list :deep(li) {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid #deddd4;
  border-radius: 12px;
  background: #ffffff;
}

.candidate-review__list :deep(.node-type) {
  display: inline-flex;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  color: #2f4f6f;
  font-size: 12px;
  font-weight: 700;
  background: #e4eef6;
}

.candidate-review__list :deep(.anchor-id),
.candidate-review__list :deep(.confidence) {
  color: #687064;
  font-size: 12px;
}

.candidate-review__list :deep(.accept-action) {
  justify-self: start;
  margin-top: 4px;
  padding: 6px 12px;
  border: 1px solid #2f4f6f;
  border-radius: 8px;
  color: #2f4f6f;
  font-size: 13px;
  background: #ffffff;
  cursor: pointer;
}

.candidate-review__list :deep(.accept-action:hover:not(:disabled)) {
  background: #e4eef6;
}

.candidate-review__list :deep(.accept-action:disabled) {
  cursor: default;
  opacity: 0.7;
  color: #466846;
  border-color: #466846;
  background: #e8f0e6;
}
</style>
