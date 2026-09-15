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

const compactButtonLabel = computed(() => {
  if (props.status === 'generating') {
    return '…'
  }
  if (props.status === 'ready') {
    return '再编译'
  }
  if (props.status === 'error') {
    return '重试'
  }
  return '编译'
})

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
      ? '首次编译会先清空确认图，再读全文提议候选；候选需审阅后才进入确认模型'
      : '请先保存笔记'
  }
  if (props.status === 'generating') {
    return '正在生成候选，约需一分钟。请保持 worker 运行，不要刷新页面。'
  }
  if (props.status === 'ready') {
    return props.compact
      ? `${props.candidateNodeCount} 个候选待审阅`
      : `已生成 ${props.candidateNodeCount} 个候选节点：确认图已清空，请在审阅区逐条接受`
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
    <button
      class="candidate-generation__button"
      type="button"
      :title="statusMessage"
      :disabled="!canGenerate"
      @click="emit('generate')"
    >
      {{ compact ? compactButtonLabel : buttonLabel }}
    </button>
    <p
      class="candidate-generation__status"
      :class="{
        'candidate-generation__status--compact': compact,
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
  position: relative;
  align-content: center;
  justify-items: center;
  min-width: 0;
  width: 32px;
  padding: 0;
  text-align: center;
}

.candidate-generation__button {
  padding: 9px 14px;
  border: 0;
  border-radius: 9px;
  color: #ffffff;
  font: inherit;
  font-weight: 700;
  background: var(--gyre);
  cursor: pointer;
}

.candidate-generation--compact .candidate-generation__button {
  width: 32px;
  min-height: 108px;
  padding: 14px 0;
  border-radius: 8px;
  font-size: 13px;
  letter-spacing: 0.22em;
  writing-mode: vertical-rl;
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

.candidate-generation__status--compact {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.candidate-generation__status--ready {
  color: #466846;
}

.candidate-generation__status--error {
  color: #a23d35;
}
</style>
