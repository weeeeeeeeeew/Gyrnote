<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  THOUGHT_EDGE_TYPES,
  THOUGHT_NODE_TYPES,
  type ThoughtEdgeType,
  type ThoughtNode,
  type ThoughtNodeType,
} from '../domain/thought-model'

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
      @click="isOpen = !isOpen"
    >
      {{ isOpen ? '收起新建' : '新建节点/关系' }}
    </button>

    <div v-if="isOpen" class="correction-toolkit__panel">
      <form class="correction-toolkit__row" @submit.prevent="handleCreateNode">
        <span class="correction-toolkit__label">新建节点</span>
        <select v-model="nodeType" aria-label="新建节点类型">
          <option v-for="type in THOUGHT_NODE_TYPES" :key="type" :value="type">{{ type }}</option>
        </select>
        <input
          v-if="nodeType === 'custom'"
          v-model="nodeLabel"
          type="text"
          aria-label="新建节点自定义标签"
          placeholder="自定义类型名"
        />
        <input
          v-model="nodeText"
          type="text"
          aria-label="新建节点文本"
          placeholder="节点文本"
        />
        <button type="submit" :disabled="!canCreateNode">添加</button>
      </form>

      <form class="correction-toolkit__row" @submit.prevent="handleCreateEdge">
        <span class="correction-toolkit__label">新建关系</span>
        <select v-model="sourceNodeId" aria-label="关系起点">
          <option value="" disabled>起点</option>
          <option v-for="node in nodes" :key="`source-${node.id}`" :value="node.id">
            {{ node.text }}
          </option>
        </select>
        <select v-model="edgeType" aria-label="新建关系类型">
          <option v-for="type in THOUGHT_EDGE_TYPES" :key="type" :value="type">{{ type }}</option>
        </select>
        <input
          v-if="edgeType === 'custom'"
          v-model="edgeLabel"
          type="text"
          aria-label="新建关系自定义标签"
          placeholder="自定义关系名"
        />
        <select v-model="targetNodeId" aria-label="关系终点">
          <option value="" disabled>终点</option>
          <option v-for="node in nodes" :key="`target-${node.id}`" :value="node.id">
            {{ node.text }}
          </option>
        </select>
        <button type="submit" :disabled="!canCreateEdge">添加</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.correction-toolkit {
  position: relative;
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid #deddd4;
  background: #f4f1e8;
}

.correction-toolkit__toggle {
  padding: 5px 10px;
  border: 1px solid #c9cbc3;
  border-radius: 8px;
  color: #38523a;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
}

.correction-toolkit__panel {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #deddd4;
  border-radius: 10px;
  background: #fffdf8;
  box-shadow: 0 8px 24px rgb(43 48 38 / 10%);
}

.correction-toolkit__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.correction-toolkit__label {
  flex: 0 0 auto;
  color: #5a6258;
  font-size: 12px;
  font-weight: 700;
}

.correction-toolkit select,
.correction-toolkit input {
  min-width: 0;
  flex: 1 1 110px;
  padding: 6px 8px;
  border: 1px solid #c9cbc3;
  border-radius: 8px;
  color: inherit;
  font: inherit;
  background: #ffffff;
}

.correction-toolkit__row > button[type='submit'] {
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
  background: #48634d;
}

.correction-toolkit__row > button[type='submit']:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}
</style>
