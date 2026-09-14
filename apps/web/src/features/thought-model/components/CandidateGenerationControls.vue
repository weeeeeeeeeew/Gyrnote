<script setup lang="ts">
import { computed } from 'vue'

import type { CandidateGenerationStatus } from '../domain/thought-model'

const props = defineProps<{
  noteId: string | null
  revision: number | null
  status: CandidateGenerationStatus
  errorMessage: string | null
  candidateNodeCount: number
  compact?: boolean
}>()

const emit = defineEmits<{
  generate: []
}>()

const canGenerate = computed(() => {
  return (
    Boolean(props.noteId?.trim()) &&
    props.revision !== null &&
    Number.isInteger(props.revision) &&
    props.revision >= 1 &&
    props.status !== 'generating'
  )
})

const buttonLabel = computed(() => {
  if (props.status === 'generating') {
    return '生成中…'
  }
  if (props.status === 'ready') {
    return props.compact ? '重新编译' : '重新生成候选模型'
  }
  if (props.status === 'error') {
    return props.compact ? '重试编译' : '重试生成候选模型'
  }
  return props.compact ? '首次编译' : '生成候选模型'
})

const statusMessage = computed(() => {
  if (props.status === 'idle') {
    return props.noteId
      ? '首次编译：可读全文并提议证据锚点；候选需审阅后才进入确认模型'
      : '请先保存笔记'
  }
  if (props.status === 'generating') {
    return '正在生成…'
  }
  if (props.status === 'ready') {
    return props.compact
      ? `${props.candidateNodeCount} 个候选待审阅`
      : `已生成 ${props.candidateNodeCount} 个候选节点：请在审阅区接受；图/大纲仍是确认模型`
  }
  return props.errorMessage ?? '候选模型生成失败'
})
</script>

<template>
  <section
    class="candidate-generation"
    :class="{ 'candidate-generation--compact': compact }"
    aria-label="候选模型生成"
  >
    <p v-if="compact" class="candidate-generation__bridge-label">编译桥接</p>
    <button
      class="candidate-generation__button"
      type="button"
      :disabled="!canGenerate"
      @click="emit('generate')"
    >
      {{ buttonLabel }}
    </button>
    <p
      class="candidate-generation__status"
      :class="{
        'candidate-generation__status--ready': status === 'ready',
        'candidate-generation__status--error': status === 'error',
      }"
      :role="status === 'error' ? 'alert' : 'status'"
    >
      {{ statusMessage }}
    </p>
  </section>
</template>

<style scoped>
.candidate-generation {
  display: grid;
  gap: 8px;
  min-width: min(280px, 100%);
}

.candidate-generation--compact {
  align-content: center;
  justify-items: center;
  min-width: 0;
  width: 108px;
  padding: 12px 8px;
  text-align: center;
}

.candidate-generation__bridge-label {
  margin: 0;
  color: #687064;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.candidate-generation__button {
  padding: 9px 14px;
  border: 1px solid #2f4f6f;
  border-radius: 9px;
  color: #ffffff;
  font: inherit;
  font-weight: 700;
  background: #2f4f6f;
  cursor: pointer;
}

.candidate-generation--compact .candidate-generation__button {
  width: 100%;
  padding: 10px 8px;
  font-size: 13px;
  writing-mode: horizontal-tb;
}

.candidate-generation__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.candidate-generation__status {
  margin: 0;
  color: #687064;
  font-size: 13px;
}

.candidate-generation--compact .candidate-generation__status {
  font-size: 11px;
  line-height: 1.35;
}

.candidate-generation__status--ready {
  color: #466846;
}

.candidate-generation__status--error {
  color: #a23d35;
}
</style>
