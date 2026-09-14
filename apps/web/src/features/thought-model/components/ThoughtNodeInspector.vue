<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { IdentifiedSourceAnchor } from '@/features/source-anchors/domain/source-anchor'

import type { ThoughtNode } from '../domain/thought-model'
import { displayThoughtTypeLabel } from '../domain/thought-model'

const props = defineProps<{
  node: ThoughtNode | null
  sourceAnchor?: IdentifiedSourceAnchor | null
}>()

const emit = defineEmits<{
  save: [text: string]
  lock: []
  unlock: []
  delete: []
}>()

const draftText = ref('')

/**
 * M1 学习检查点 1：当选中节点变化时，把节点文本同步到本地草稿。
 *
 * 约束：
 * - 选中节点时，draftText 等于该节点的 text；
 * - node 变为 null 时，draftText 清空；
 * - 不要直接修改 props.node.text。
 */
watch(
  () => props.node,
  (node) => {
    draftText.value = node?.text ?? ''
  },
  { immediate: true },
)

/**
 * M1 学习检查点 2：只有非空且真正变化的草稿才允许保存。
 */
const canSave = computed(() => {
  const node = props.node
  if (!node || node.reviewStatus === 'locked') {
    return false
  }
  const trimmed = draftText.value.trim()
  return trimmed !== '' && trimmed !== node.text.trim()
})

const canLock = computed(() => {
  return props.node !== null && props.node.reviewStatus !== 'locked'
})

const canUnlock = computed(() => {
  return props.node !== null && props.node.reviewStatus === 'locked'
})

const canDelete = computed(() => {
  return props.node !== null && props.node.reviewStatus !== 'locked'
})

function handleSubmit() {
  if (!canSave.value) {
    return
  }

  emit('save', draftText.value)
}

function handleLock() {
  if (!canLock.value) {
    return
  }

  emit('lock')
}

function handleUnlock() {
  if (!canUnlock.value) {
    return
  }

  emit('unlock')
}

function handleDelete() {
  if (!canDelete.value) {
    return
  }

  emit('delete')
}
</script>

<template>
  <aside class="inspector" aria-label="节点检查器">
    <template v-if="node">
      <div class="inspector__layout">
        <div class="inspector__main">
          <div class="inspector__title-row">
            <span class="node-type">{{ displayThoughtTypeLabel(node.type, node.label) }}</span>
            <span class="inspector__id">{{ node.id }}</span>
          </div>
          <form class="inspector__form" @submit.prevent="handleSubmit">
            <label for="thought-node-text">节点文本</label>
            <textarea
              id="thought-node-text"
              v-model="draftText"
              rows="2"
              :disabled="node.reviewStatus === 'locked'"
            />
            <div class="inspector__actions">
              <button
                type="button"
                class="inspector__delete"
                aria-label="删除节点"
                :disabled="!canDelete"
                @click="handleDelete"
              >
                删除
              </button>
              <button
                v-if="node.reviewStatus === 'locked'"
                type="button"
                aria-label="解锁节点"
                :disabled="!canUnlock"
                @click="handleUnlock"
              >
                解锁
              </button>
              <button
                v-else
                type="button"
                aria-label="锁定节点"
                :disabled="!canLock"
                @click="handleLock"
              >
                锁定
              </button>
              <button type="submit" :disabled="!canSave">保存文本</button>
            </div>
          </form>
        </div>

        <dl class="inspector__meta">
          <div>
            <dt>来源</dt>
            <dd>{{ node.origin }}</dd>
          </div>
          <div>
            <dt>显式性</dt>
            <dd>{{ node.explicitness }}</dd>
          </div>
          <div>
            <dt>审阅状态</dt>
            <dd>{{ node.reviewStatus }}</dd>
          </div>
          <div class="inspector__meta-anchor">
            <dt>原文锚点</dt>
            <dd>
              <template v-if="node && node.sourceAnchorIds.length > 0">
                {{ sourceAnchor ? `“${sourceAnchor.quote}”` : node.sourceAnchorIds.join(', ') }}
                <span v-if="node.sourceAnchorIds.length > 1">
                  等 {{ node.sourceAnchorIds.length }} 处
                </span>
              </template>
              <template v-else>未关联</template>
            </dd>
          </div>
        </dl>
      </div>
    </template>
    <p v-else class="inspector__empty">选择一个节点，在这里查看和编辑领域属性。</p>
  </aside>
</template>

<style scoped>
.inspector {
  padding: 12px 16px;
  border-top: 1px solid #deddd4;
  background: #f8f6ef;
}

.inspector__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.9fr);
  gap: 16px 20px;
  align-items: start;
}

.inspector__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.inspector__id {
  color: #8a9086;
  font-size: 12px;
}

.node-type {
  display: inline-flex;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  color: #38523a;
  font-size: 12px;
  font-weight: 700;
  background: #e3eee0;
}

.inspector__form {
  display: grid;
  gap: 6px;
}

.inspector__form label,
.inspector dt {
  color: #777d73;
  font-size: 12px;
}

.inspector__form textarea {
  width: 100%;
  resize: vertical;
  min-height: 52px;
  max-height: 96px;
  padding: 8px 10px;
  border: 1px solid #c9cbc3;
  border-radius: 8px;
  color: inherit;
  font: inherit;
  line-height: 1.4;
  background: #ffffff;
}

.inspector__form textarea:focus-visible {
  border-color: #57735b;
  outline: 3px solid rgb(87 115 91 / 16%);
}

.inspector__form button {
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
  background: #48634d;
}

.inspector__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.inspector__actions button[type='button'] {
  color: #2f4f6f;
  background: #e4eef6;
}

.inspector__actions .inspector__delete {
  margin-right: auto;
  color: #6b3a3a;
  background: #f3e4e4;
}

.inspector__form button:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}

.inspector__form textarea:disabled {
  color: #687064;
  background: #f0eee7;
  cursor: not-allowed;
}

.inspector__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0;
}

.inspector__meta div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
  min-width: 0;
}

.inspector__meta-anchor {
  grid-column: 1 / -1;
}

.inspector dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.inspector__empty {
  margin: 0;
  color: #687064;
}

@media (max-width: 900px) {
  .inspector__layout {
    grid-template-columns: 1fr;
  }
}
</style>
