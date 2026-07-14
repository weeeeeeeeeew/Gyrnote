<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ThoughtNode } from '../domain/thought-model'

const props = defineProps<{
  node: ThoughtNode | null
}>()

const emit = defineEmits<{
  save: [text: string]
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
  if (!node) {
    return false
  }
  const trimmed = draftText.value.trim()
  return trimmed !== '' && trimmed !== node.text.trim()
})

function handleSubmit() {
  if (!canSave.value) {
    return
  }

  emit('save', draftText.value)
}
</script>

<template>
  <aside class="inspector" aria-label="节点检查器">
    <template v-if="node">
      <span class="node-type">{{ node.type }}</span>
      <form class="inspector__form" @submit.prevent="handleSubmit">
        <label for="thought-node-text">节点文本</label>
        <textarea id="thought-node-text" v-model="draftText" rows="5" />
        <button type="submit" :disabled="!canSave">保存文本</button>
      </form>

      <dl>
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
      </dl>
    </template>
    <p v-else>选择一个节点，在这里查看和编辑领域属性。</p>
  </aside>
</template>

<style scoped>
.inspector {
  padding: 24px;
  border-left: 1px solid #deddd4;
  background: #f8f6ef;
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
  gap: 10px;
  margin: 18px 0 24px;
}

.inspector__form label,
.inspector dt {
  color: #777d73;
  font-size: 12px;
}

.inspector__form textarea {
  width: 100%;
  resize: vertical;
  padding: 10px;
  border: 1px solid #c9cbc3;
  border-radius: 10px;
  color: inherit;
  font: inherit;
  line-height: 1.45;
  background: #ffffff;
}

.inspector__form textarea:focus-visible {
  border-color: #57735b;
  outline: 3px solid rgb(87 115 91 / 16%);
}

.inspector__form button {
  justify-self: end;
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
  background: #48634d;
}

.inspector__form button:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}

.inspector dl {
  display: grid;
  gap: 14px;
}

.inspector dl div {
  display: grid;
  gap: 2px;
}

.inspector dd {
  margin: 0;
}

@media (max-width: 760px) {
  .inspector {
    border-top: 1px solid #deddd4;
    border-left: 0;
  }
}
</style>
