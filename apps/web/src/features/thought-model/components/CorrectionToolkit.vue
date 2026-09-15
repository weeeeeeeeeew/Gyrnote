<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  THOUGHT_EDGE_TYPES,
  THOUGHT_NODE_TYPES,
  type ThoughtEdgeType,
  type ThoughtNode,
  type ThoughtNodeType,
} from '../domain/thought-model'
import WorkbenchModal from './WorkbenchModal.vue'

defineProps<{
  nodes: ThoughtNode[]
}>()

const emit = defineEmits<{
  createNode: [payload: { type: ThoughtNodeType; text: string; label?: string | null }]
  createEdge: [
    payload: {
      sourceNodeId: string
      targetNodeId: string
      type: ThoughtEdgeType
      label?: string | null
    },
  ]
}>()

const NODE_TYPE_ZH: Record<ThoughtNodeType, string> = {
  question: '问题',
  concept: '概念',
  observation: '观察',
  claim: '主张',
  evidence: '证据',
  assumption: '假设',
  counterpoint: '反驳',
  decision: '决策',
  open_question: '未决问题',
  action: '行动',
  custom: '自定义',
}

const EDGE_TYPE_ZH: Record<ThoughtEdgeType, string> = {
  supports: '支持',
  challenges: '质疑',
  depends_on: '依赖',
  qualifies: '限定',
  explains: '解释',
  leads_to: '导向',
  answers: '回答',
  tests: '检验',
  custom: '自定义',
}

const isOpen = ref(false)
const nodeType = ref<ThoughtNodeType>('claim')
const nodeText = ref('')
const nodeLabel = ref('')
const edgeType = ref<ThoughtEdgeType>('supports')
const edgeLabel = ref('')
const sourceNodeId = ref('')
const targetNodeId = ref('')

const canCreateNode = computed(() => {
  if (nodeText.value.trim() === '') {
    return false
  }
  if (nodeType.value === 'custom' && nodeLabel.value.trim() === '') {
    return false
  }
  return true
})

const canCreateEdge = computed(() => {
  if (
    !sourceNodeId.value ||
    !targetNodeId.value ||
    sourceNodeId.value === targetNodeId.value
  ) {
    return false
  }
  if (edgeType.value === 'custom' && edgeLabel.value.trim() === '') {
    return false
  }
  return true
})

function handleCreateNode() {
  if (!canCreateNode.value) {
    return
  }
  emit('createNode', {
    type: nodeType.value,
    text: nodeText.value,
    label: nodeType.value === 'custom' ? nodeLabel.value : null,
  })
  nodeText.value = ''
  nodeLabel.value = ''
}

function shortNodeText(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= 24) {
    return trimmed
  }
  return `${trimmed.slice(0, 24)}…`
}

function handleCreateEdge() {
  if (!canCreateEdge.value) {
    return
  }
  emit('createEdge', {
    sourceNodeId: sourceNodeId.value,
    targetNodeId: targetNodeId.value,
    type: edgeType.value,
    label: edgeType.value === 'custom' ? edgeLabel.value : null,
  })
  edgeLabel.value = ''
}
</script>

<template>
  <section class="correction-toolkit" aria-label="校正工具">
    <button
      class="correction-toolkit__toggle"
      type="button"
      :aria-expanded="isOpen"
      @click="isOpen = true"
    >
      新建
    </button>

    <WorkbenchModal :open="isOpen" size="form" title="新建节点 / 关系" @close="isOpen = false">
      <div class="correction-toolkit__panel">
        <form class="correction-toolkit__form" @submit.prevent="handleCreateNode">
          <h3>节点</h3>
          <label>
            类型
            <select v-model="nodeType" aria-label="新建节点类型">
              <option v-for="type in THOUGHT_NODE_TYPES" :key="type" :value="type">
                {{ NODE_TYPE_ZH[type] }}
              </option>
            </select>
          </label>
          <label v-if="nodeType === 'custom'">
            自定义类型名
            <input
              v-model="nodeLabel"
              type="text"
              aria-label="新建节点自定义标签"
              placeholder="例如：约束"
            />
          </label>
          <label>
            文本
            <textarea
              v-model="nodeText"
              rows="3"
              aria-label="新建节点文本"
              placeholder="节点要表达的意思"
            />
          </label>
          <button type="submit" :disabled="!canCreateNode">添加节点</button>
        </form>

        <form class="correction-toolkit__form" @submit.prevent="handleCreateEdge">
          <h3>关系</h3>
          <label>
            起点
            <select v-model="sourceNodeId" aria-label="关系起点">
              <option value="" disabled>选择起点</option>
              <option v-for="node in nodes" :key="`source-${node.id}`" :value="node.id">
                {{ shortNodeText(node.text) }}
              </option>
            </select>
          </label>
          <label>
            类型
            <select v-model="edgeType" aria-label="新建关系类型">
              <option v-for="type in THOUGHT_EDGE_TYPES" :key="type" :value="type">
                {{ EDGE_TYPE_ZH[type] }}
              </option>
            </select>
          </label>
          <label v-if="edgeType === 'custom'">
            自定义关系名
            <input
              v-model="edgeLabel"
              type="text"
              aria-label="新建关系自定义标签"
              placeholder="例如：类比"
            />
          </label>
          <label>
            终点
            <select v-model="targetNodeId" aria-label="关系终点">
              <option value="" disabled>选择终点</option>
              <option v-for="node in nodes" :key="`target-${node.id}`" :value="node.id">
                {{ shortNodeText(node.text) }}
              </option>
            </select>
          </label>
          <button type="submit" :disabled="!canCreateEdge">添加关系</button>
        </form>
      </div>
    </WorkbenchModal>
  </section>
</template>

<style scoped>
.correction-toolkit {
  position: relative;
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gyre-line);
  background: var(--gyre-surface);
}

.correction-toolkit__toggle {
  padding: 5px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
}

.correction-toolkit__panel {
  display: grid;
  gap: 20px;
  width: 100%;
  max-width: 100%;
}

.correction-toolkit__form {
  display: grid;
  gap: 10px;
}

.correction-toolkit__form h3 {
  margin: 0;
  color: var(--gyre-ink);
  font-size: 13px;
  font-weight: 700;
}

.correction-toolkit__form label {
  display: grid;
  gap: 4px;
  color: var(--gyre-deep);
  font-size: 12px;
  font-weight: 700;
}

.correction-toolkit__form select,
.correction-toolkit__form input,
.correction-toolkit__form textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  background: #ffffff;
}

.correction-toolkit__form select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%230a5d86' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.correction-toolkit__form textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.45;
}

.correction-toolkit__form > button[type='submit'] {
  justify-self: start;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  background: var(--gyre-mist);
}

.correction-toolkit__form > button[type='submit']:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}
</style>
