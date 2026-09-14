<script setup lang="ts">
import { ref } from 'vue'

import type { ModelPatch } from '../domain/model-patch'

const props = defineProps<{
  patch: ModelPatch | null
  feedback: string | null
  reviewStatus?: string
  reviewBusy?: boolean
}>()

const emit = defineEmits<{
  loadFixture: []
  proposeFromNote: []
  compileFromInstruction: [instruction: string]
  apply: []
  dismiss: []
}>()

const instruction = ref('')

function submitInstruction(): void {
  const text = instruction.value.trim()
  if (!text || props.reviewBusy) {
    return
  }
  emit('compileFromInstruction', text)
}

function summarizeOp(op: ModelPatch['ops'][number]): string {
  if (op.op === 'update_node_text') {
    return `更新节点 ${op.nodeId} 文本`
  }
  if (op.op === 'move_anchor') {
    return `迁移锚点 ${op.anchorId} 至 [${op.startOffset}, ${op.endOffset})`
  }
  return `删除节点 ${op.nodeId}（级联边）`
}
</script>

<template>
  <section class="model-patch-review" aria-label="候选 ModelPatch">
    <header class="model-patch-review__header">
      <h2>候选 ModelPatch</h2>
      <div class="model-patch-review__actions">
        <button type="button" @click="emit('loadFixture')">加载 fixture patch</button>
        <button type="button" @click="emit('proposeFromNote')">从原文变更生成 patch</button>
        <button type="button" :disabled="!props.patch || props.reviewBusy" @click="emit('apply')">
          批准应用
        </button>
        <button type="button" :disabled="!props.patch || props.reviewBusy" @click="emit('dismiss')">
          丢弃
        </button>
        <form class="model-patch-review__instruction" @submit.prevent="submitInstruction">
          <label>
            自然语言改图
            <input
              v-model="instruction"
              type="text"
              maxlength="2000"
              placeholder="例如：把论点改成结构必须回到笔记"
              :disabled="props.reviewBusy"
            />
          </label>
          <button type="submit" :disabled="props.reviewBusy">生成候选 patch</button>
        </form>
      </div>
    </header>

    <p v-if="props.feedback" class="model-patch-review__feedback" role="status">
      {{ props.feedback }}
    </p>

    <p v-if="!props.patch" class="model-patch-review__empty">
      尚无候选 patch。可加载 fixture，或对照原文锚点失效生成。图与原文意合而不形合，不必覆盖全文。
    </p>

    <template v-else>
      <p class="model-patch-review__meta">
        {{ props.patch.reason }} · base v{{ props.patch.baseModelVersion }} ·
        {{ props.patch.ops.length }} ops
        <template v-if="props.reviewStatus && props.reviewStatus !== 'idle'">
          · 审阅 {{ props.reviewStatus }}
        </template>
      </p>
      <ol class="model-patch-review__ops">
        <li v-for="(op, index) in props.patch.ops" :key="`${op.op}-${index}`">
          <code>{{ op.op }}</code>
          {{ summarizeOp(op) }}
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.model-patch-review {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border, #d0d7de);
  border-radius: 6px;
  background: var(--color-background-soft, #f6f8fa);
}

.model-patch-review__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.model-patch-review__header h2 {
  margin: 0;
  font-size: 0.95rem;
}

.model-patch-review__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.model-patch-review__actions button {
  font-size: 0.8rem;
}

.model-patch-review__instruction {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.model-patch-review__instruction label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.model-patch-review__instruction input {
  min-width: 16rem;
}

.model-patch-review__meta,
.model-patch-review__empty,
.model-patch-review__feedback {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-mute, #57606a);
}

.model-patch-review__feedback {
  color: var(--color-text, #24292f);
}

.model-patch-review__ops {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.85rem;
}

.model-patch-review__ops code {
  margin-right: 0.35rem;
}
</style>
