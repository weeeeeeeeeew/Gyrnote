<script setup lang="ts">
import { computed, ref } from 'vue'

import type { CandidateThoughtModel } from '../domain/thought-model'
import { displayThoughtTypeLabel } from '../domain/thought-model'
import WorkbenchModal from './WorkbenchModal.vue'

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
const detailNodeId = ref<string | null>(null)
const detailEdgeId = ref<string | null>(null)

const detailNode = computed(() => props.candidate?.nodes.find((node) => node.id === detailNodeId.value) ?? null)
const detailEdge = computed(() => props.candidate?.edges.find((edge) => edge.id === detailEdgeId.value) ?? null)

function isNodeAccepted(nodeId: string): boolean {
  return confirmedNodeIdSet.value.has(nodeId)
}

function isEdgeAccepted(edgeId: string): boolean {
  return confirmedEdgeIdSet.value.has(edgeId)
}

function closeDetail(): void {
  detailNodeId.value = null
  detailEdgeId.value = null
}
</script>

<template>
  <section class="candidate-review" aria-label="候选模型审阅">
    <header class="candidate-review__header">
      <h2>候选模型（待审阅）</h2>
      <p class="candidate-review__hint">
        候选只在此列表（接受后会从这里移除）。顶部「批准应用」仍逐条写入，锁定节点不会被覆盖；不会整表覆盖确认模型。
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
            <button
              type="button"
              class="candidate-card"
              :aria-label="`查看候选节点 ${node.id}`"
              @click="detailNodeId = node.id"
            >
              <span class="node-type">{{ displayThoughtTypeLabel(node.type, node.label) }}</span>
              <span class="candidate-card__text">{{ node.text }}</span>
            </button>
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
            <button
              type="button"
              class="candidate-card"
              :aria-label="`查看候选关系 ${edge.id}`"
              @click="detailEdgeId = edge.id"
            >
              <span class="node-type">{{ displayThoughtTypeLabel(edge.type, edge.label) }}</span>
              <span class="candidate-card__text">{{ edge.sourceNodeId }} → {{ edge.targetNodeId }}</span>
            </button>
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

    <WorkbenchModal
      :open="detailNode !== null || detailEdge !== null"
      size="tall"
      :title="detailNode ? '候选节点' : '候选关系'"
      @close="closeDetail"
    >
      <template v-if="detailNode">
        <p><strong>{{ displayThoughtTypeLabel(detailNode.type, detailNode.label) }}</strong></p>
        <p>{{ detailNode.text }}</p>
        <p class="candidate-review__detail-meta">锚点 {{ detailNode.sourceAnchorIds.join(', ') }} · 置信 {{ detailNode.confidence }}</p>
        <button
          type="button"
          class="accept-action"
          :disabled="isNodeAccepted(detailNode.id)"
          @click="emit('acceptNode', detailNode.id); closeDetail()"
        >
          {{ isNodeAccepted(detailNode.id) ? '已接受' : '接受此节点' }}
        </button>
      </template>
      <template v-else-if="detailEdge">
        <p><strong>{{ displayThoughtTypeLabel(detailEdge.type, detailEdge.label) }}</strong></p>
        <p>{{ detailEdge.sourceNodeId }} → {{ detailEdge.targetNodeId }}</p>
        <p class="candidate-review__detail-meta">置信 {{ detailEdge.confidence }}</p>
        <button
          type="button"
          class="accept-action"
          :disabled="isEdgeAccepted(detailEdge.id)"
          @click="emit('acceptEdge', detailEdge.id); closeDetail()"
        >
          {{ isEdgeAccepted(detailEdge.id) ? '已接受' : '接受此关系' }}
        </button>
      </template>
    </WorkbenchModal>
  </section>
</template>

<style scoped>
.candidate-review {
  padding: 14px 16px 16px;
  border: 0;
  background: var(--gyre-mist);
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
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 10px;
  background: #ffffff;
}

.candidate-card {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.candidate-card__text {
  overflow: hidden;
  color: var(--gyre-ink);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accept-all,
.candidate-review__detail-meta {
  font-size: 12px;
}

.accept-all {
  padding: 5px 10px;
  border: 1px solid var(--gyre);
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  background: var(--gyre);
  cursor: pointer;
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
