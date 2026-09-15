<script setup lang="ts">
import { nextTick, ref } from 'vue'

import { ApiError } from '@/api/http-client'

import {
  answerNoteQuestion,
  type NoteAnswerRefuseReason,
  type NoteAnswerResult,
  type NoteAnswerTurnPayload,
} from '../api/note-answers-api'
import WorkbenchModal from './WorkbenchModal.vue'

const props = defineProps<{
  noteId: string | null
}>()

const emit = defineEmits<{
  openNote: [noteId: string]
}>()

interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  result?: NoteAnswerResult
  error?: string
}

const isOpen = ref(false)
const draft = ref('')
const currentNoteOnly = ref(Boolean(props.noteId))
const busy = ref(false)
const messages = ref<ChatTurn[]>([welcomeTurn()])
const threadRef = ref<HTMLElement | null>(null)
let requestSeq = 0

function welcomeTurn(): ChatTurn {
  return {
    role: 'assistant',
    text: '针对当前笔记提问。每一轮都会先召回锚定原文，再只根据这些原文回答。不会改确认图。',
  }
}

async function runAnswer() {
  const text = draft.value.trim()
  if (!text || busy.value) {
    return
  }
  const seq = ++requestSeq
  busy.value = true
  messages.value.push({ role: 'user', text })
  draft.value = ''
  await scrollThread()
  try {
    const next = await answerNoteQuestion({
      query: text,
      k: 5,
      noteIds: currentNoteOnly.value && props.noteId ? [props.noteId] : undefined,
      history: historyPayload(),
    })
    if (seq !== requestSeq) {
      return
    }
    messages.value.push({ role: 'assistant', text: next.answer, result: next })
  } catch (error) {
    if (seq !== requestSeq) {
      return
    }
    messages.value.push({ role: 'assistant', text: formatAnswerError(error), error: formatAnswerError(error) })
  } finally {
    if (seq === requestSeq) {
      busy.value = false
      await scrollThread()
    }
  }
}

function historyPayload(): NoteAnswerTurnPayload[] {
  return messages.value
    .slice(0, -1)
    .filter((turn) => turn.role === 'user' || Boolean(turn.result) || Boolean(turn.error))
    .map((turn) => ({ role: turn.role, content: turn.text }))
    .slice(-8)
}

function formatAnswerError(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return '笔记问答需要聊天模型和向量模型。请在「模型密钥」里分别填写；不要用结构查询代替。'
  }
  if (error instanceof ApiError && error.status === 400) {
    return '查询无效，或入库向量与查询不是同一模型/维度。请重新保存笔记再建索引。'
  }
  if (error instanceof ApiError && error.status === 502) {
    return readApiDetail(error) ?? '模型调用失败。问答只根据召回的原文生成，不会改确认图。'
  }
  return error instanceof Error ? error.message : '笔记问答失败'
}

function refuseHint(reason: NoteAnswerRefuseReason | null | undefined): string | null {
  if (reason === 'no_confirmed_nodes') {
    return '没有已确认结构当摘要索引。'
  }
  if (reason === 'no_similar_nodes') {
    return '确认图里没有相关节点。'
  }
  if (reason === 'no_anchored_blocks') {
    return '相关节点还没有锚定到正文。'
  }
  if (reason === 'no_passages' || reason === 'insufficient_evidence') {
    return '召回的原文不够支撑回答。'
  }
  return null
}

function isCited(result: NoteAnswerResult, blockId: string): boolean {
  return result.citedBlockIds.includes(blockId)
}

async function scrollThread() {
  await nextTick()
  const el = threadRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

function readApiDetail(error: ApiError): string | null {
  if (!isRecord(error.data) || typeof error.data.detail !== 'string') {
    return null
  }
  const detail = error.data.detail.trim()
  return detail || null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
</script>

<template>
  <section class="note-answer" aria-label="笔记问答">
    <button
      class="note-answer__toggle"
      type="button"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      笔记问答
    </button>
    <WorkbenchModal :open="isOpen" size="tall" title="笔记问答" @close="isOpen = false">
      <div class="note-answer__chat">
        <p class="note-answer__lead">
          大模型对话界面：每轮先双层召回锚定原文，再只根据这些原文作答。默认当前笔记。
        </p>
        <label class="note-answer__scope">
          <input
            v-model="currentNoteOnly"
            type="checkbox"
            name="current-note-only"
            :disabled="busy || !noteId"
          />
          仅当前笔记
        </label>
        <ol ref="threadRef" class="note-answer__thread" aria-live="polite">
          <li
            v-for="(message, index) in messages"
            :key="`${message.role}-${index}`"
            :class="message.role"
          >
            <span class="note-answer__role">{{ message.role === 'user' ? '你' : 'Gyrnote' }}</span>
            <p :role="message.role === 'assistant' ? 'status' : undefined">{{ message.text }}</p>
            <p v-if="refuseHint(message.result?.refuseReason)" class="note-answer__hint">
              {{ refuseHint(message.result?.refuseReason) }}
            </p>
            <ol v-if="message.result && message.result.hits.length > 0" class="note-answer__hits">
              <li v-for="hit in message.result.hits" :key="`${hit.noteId}:${hit.blockId}`">
                <button type="button" @click="emit('openNote', hit.noteId)">
                  <span class="note-answer__title">
                    {{ hit.noteTitle }}
                    <span v-if="isCited(message.result, hit.blockId)" class="note-answer__cited">已引用</span>
                  </span>
                  <span>{{ hit.text }}</span>
                </button>
              </li>
            </ol>
          </li>
        </ol>
        <form class="note-answer__composer" @submit.prevent="runAnswer">
          <label>
            问题
            <textarea
              v-model="draft"
              name="note-answer-query"
              rows="3"
              maxlength="2000"
              aria-label="笔记问答"
              placeholder="例如：T0 目标是什么"
              :disabled="busy"
            />
          </label>
          <button type="submit" :disabled="busy || !draft.trim()">
            {{ busy ? '作答中…' : '发送' }}
          </button>
        </form>
      </div>
    </WorkbenchModal>
  </section>
</template>

<style scoped>
.note-answer {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gyre-line);
  background: var(--gyre-surface);
}

.note-answer__toggle {
  width: fit-content;
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

.note-answer__chat {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 8px;
  min-height: min(62vh, 560px);
}

.note-answer__lead,
.note-answer__hint,
.note-answer__scope {
  margin: 0;
  color: var(--gyre-deep);
  font-size: 12px;
  line-height: 1.5;
}

.note-answer__scope {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
}

.note-answer__thread {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 220px;
  max-height: min(48vh, 420px);
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.note-answer__thread > li {
  display: grid;
  gap: 6px;
  width: min(94%, 460px);
  padding: 8px 10px;
  border-radius: 12px;
}

.note-answer__thread > li.user {
  justify-self: end;
  color: #ffffff;
  background: var(--gyre);
}

.note-answer__thread > li.assistant {
  justify-self: start;
  color: var(--gyre-ink);
  background: #ffffff;
  border: 1px solid var(--gyre-line);
}

.note-answer__role {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.8;
}

.note-answer__thread p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.note-answer__composer {
  display: grid;
  gap: 8px;
}

.note-answer__composer label {
  display: grid;
  gap: 4px;
  color: var(--gyre-deep);
  font-size: 12px;
}

.note-answer__composer button {
  justify-self: end;
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  background: var(--gyre);
}

.note-answer__composer button:disabled {
  opacity: 0.55;
}

.note-answer__hits {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.note-answer__hits button {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  background: #fff;
  font: inherit;
  text-align: left;
}

.note-answer__title {
  font-weight: 700;
}

.note-answer__cited {
  margin-left: 6px;
  font-weight: 500;
  color: var(--gyre);
}
</style>
