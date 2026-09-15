<script setup lang="ts">
import { ref, watch } from 'vue'

import type { ModelPatch } from '../domain/model-patch'

const props = defineProps<{
  feedback: string | null
  reviewBusy?: boolean
  patch?: ModelPatch | null
  reviewStatus?: string
}>()

const emit = defineEmits<{
  send: [instruction: string]
}>()

function summarizeOp(op: ModelPatch['ops'][number]): string {
  if (op.op === 'update_node_text') {
    return `更新节点 ${op.nodeId} 文本`
  }
  if (op.op === 'move_anchor') {
    return `迁移锚点 ${op.anchorId} 至 [${op.startOffset}, ${op.endOffset})`
  }
  if (op.op === 'add_edge') {
    return `新增关系 ${op.sourceNodeId} -[${op.type}]-> ${op.targetNodeId}`
  }
  if (op.op === 'delete_edge') {
    return `删除关系 ${op.edgeId}`
  }
  return `删除节点 ${op.nodeId}（级联边）`
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const draft = ref('')
const messages = ref<ChatMessage[]>([
  {
    role: 'assistant',
    text: '用自然语言改确认图。关系变化请说清（例如「证据支撑该主张」），会生成 add_edge/delete_edge 候选；改措辞才用改文字。不会为覆盖全文加节点。批准后才写入确认图。',
  },
])

watch(
  () => props.feedback,
  (feedback, previous) => {
    if (feedback && feedback !== previous) {
      messages.value.push({ role: 'assistant', text: feedback })
    }
  },
)

function submit(): void {
  const text = draft.value.trim()
  if (!text || props.reviewBusy) {
    return
  }
  messages.value.push({ role: 'user', text })
  draft.value = ''
  emit('send', text)
}
</script>

<template>
  <section class="instruction-chat" aria-label="自然语言改图">
    <header class="instruction-chat__header">
      <h2>自然语言改图</h2>
      <p>关系变化会走增删边；改措辞才改节点文字。只生成候选 patch，批准后才写入确认图；不会为覆盖全文加节点。</p>
    </header>
    <ol class="instruction-chat__thread" aria-live="polite">
      <li v-for="(message, index) in messages" :key="`${message.role}-${index}`" :class="message.role">
        <span class="instruction-chat__role">{{ message.role === 'user' ? '你' : 'Gyrnote' }}</span>
        <p>{{ message.text }}</p>
      </li>
    </ol>
    <form class="instruction-chat__composer" @submit.prevent="submit">
      <label>
        指令
        <textarea
          v-model="draft"
          rows="3"
          maxlength="2000"
          placeholder="例如：把论点改成结构必须回到笔记"
          :disabled="reviewBusy"
        />
      </label>
      <button type="submit" :disabled="reviewBusy || !draft.trim()">发送并生成候选 patch</button>
    </form>
    <div v-if="patch" class="instruction-chat__patch">
      <p>
        {{ patch.reason }} · {{ patch.ops.length }} ops
        <template v-if="reviewStatus && reviewStatus !== 'idle' && reviewStatus !== 'awaiting_review'">
          · 审阅 {{ reviewStatus }}
        </template>
      </p>
      <ol>
        <li v-for="(op, index) in patch.ops" :key="`${op.op}-${index}`">
          <code>{{ op.op }}</code>
          {{ summarizeOp(op) }}
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.instruction-chat {
  display: grid;
  gap: 10px;
  padding: 14px 16px 16px;
  border: 0;
  background: var(--gyre-mist);
}

.instruction-chat__header h2,
.instruction-chat__header p {
  margin: 0;
}

.instruction-chat__header h2 {
  font-size: 15px;
}

.instruction-chat__header p {
  margin-top: 4px;
  color: var(--gyre-deep);
  font-size: 12px;
}

.instruction-chat__thread {
  display: grid;
  gap: 8px;
  max-height: 240px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.instruction-chat__thread li {
  display: grid;
  gap: 4px;
  width: min(92%, 360px);
  padding: 8px 10px;
  border-radius: 12px;
}

.instruction-chat__thread li.user {
  justify-self: end;
  color: #ffffff;
  background: var(--gyre);
}

.instruction-chat__thread li.assistant {
  justify-self: start;
  color: var(--gyre-ink);
  background: #ffffff;
  border: 1px solid var(--gyre-line);
}

.instruction-chat__role {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.8;
}

.instruction-chat__thread p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.instruction-chat__composer {
  display: grid;
  gap: 8px;
}

.instruction-chat__composer label {
  display: grid;
  gap: 4px;
  color: var(--gyre-deep);
  font-size: 12px;
}

.instruction-chat__composer textarea {
  width: 100%;
  resize: vertical;
  min-height: 72px;
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 10px;
  color: var(--gyre-ink);
  font: inherit;
  background: #ffffff;
}

.instruction-chat__composer button {
  justify-self: end;
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  background: var(--gyre);
  cursor: pointer;
}

.instruction-chat__composer button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.instruction-chat__patch {
  display: grid;
  gap: 8px;
}

.instruction-chat__patch p,
.instruction-chat__patch li {
  margin: 0;
  color: var(--gyre-deep);
  font-size: 12px;
}

.instruction-chat__patch ol {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.instruction-chat__patch li {
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  background: #ffffff;
}

.instruction-chat__patch code {
  margin-right: 6px;
  color: var(--gyre);
  font-weight: 700;
}
</style>
