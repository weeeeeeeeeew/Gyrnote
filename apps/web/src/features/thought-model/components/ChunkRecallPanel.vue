<script setup lang="ts">
import { ref } from 'vue'

import { ApiError } from '@/api/http-client'

import { recallNoteChunks, type NoteChunkHit } from '../api/note-chunk-recalls-api'

const props = defineProps<{
  noteId: string | null
}>()

const emit = defineEmits<{
  openNote: [noteId: string]
}>()

const isOpen = ref(false)
const query = ref('')
const currentNoteOnly = ref(false)
const busy = ref(false)
const errorMessage = ref<string | null>(null)
const hasResult = ref(false)
const hits = ref<NoteChunkHit[]>([])
let requestSeq = 0

async function runRecall() {
  const text = query.value.trim()
  if (!text || busy.value) {
    return
  }
  const seq = ++requestSeq
  busy.value = true
  errorMessage.value = null
  try {
    const result = await recallNoteChunks({
      query: text,
      k: 5,
      noteIds: currentNoteOnly.value && props.noteId ? [props.noteId] : undefined,
    })
    if (seq !== requestSeq) {
      return
    }
    hasResult.value = true
    hits.value = result.hits
  } catch (error) {
    if (seq !== requestSeq) {
      return
    }
    hasResult.value = true
    hits.value = []
    errorMessage.value = formatRecallError(error)
  } finally {
    if (seq === requestSeq) {
      busy.value = false
    }
  }
}

function formatRecallError(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return '原文召回需要独立 embeddings 配置（DeepSeek chat 没有向量接口）'
  }
  if (error instanceof ApiError && error.status === 400) {
    return '查询无效，或入库向量与查询不是同一模型/维度'
  }
  return error instanceof Error ? error.message : '原文召回失败'
}
</script>

<template>
  <section class="chunk-recall" aria-label="原文片段召回">
    <button
      class="chunk-recall__toggle"
      type="button"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      {{ isOpen ? '收起原文召回' : '召回原文' }}
    </button>
    <template v-if="isOpen">
    <p class="chunk-recall__lead">检索对象是笔记正文，不是确认图。</p>
    <form class="chunk-recall__form" @submit.prevent="runRecall">
      <input
        v-model="query"
        type="search"
        name="chunk-recall-query"
        aria-label="原文召回查询"
        placeholder="用一句话找回笔记原文"
        :disabled="busy"
      />
      <label class="chunk-recall__scope">
        <input v-model="currentNoteOnly" type="checkbox" :disabled="busy || !noteId" />
        仅当前笔记
      </label>
      <button type="submit" :disabled="busy || !query.trim()">
        {{ busy ? '召回中…' : '召回原文' }}
      </button>
    </form>
    <p v-if="errorMessage" class="chunk-recall__error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="hasResult && hits.length === 0" class="chunk-recall__empty" role="status">
      没有命中
    </p>
    <ol v-else-if="hits.length > 0" class="chunk-recall__hits">
      <li v-for="hit in hits" :key="`${hit.noteId}:${hit.blockId}`">
        <button type="button" @click="emit('openNote', hit.noteId)">
          <span class="chunk-recall__title">{{ hit.noteTitle }}</span>
          <span>{{ hit.text }}</span>
          <span class="chunk-recall__score">{{ hit.score.toFixed(3) }}</span>
        </button>
      </li>
    </ol>
    </template>
  </section>
</template>

<style scoped>
.chunk-recall {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid #deddd4;
  background: #f4f1e8;
}

.chunk-recall__toggle {
  width: fit-content;
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

.chunk-recall__lead,
.chunk-recall__error,
.chunk-recall__empty,
.chunk-recall__score,
.chunk-recall__scope {
  margin: 0;
  color: #5f675b;
  font-size: 12px;
}

.chunk-recall__error {
  color: #8a2f2f;
}

.chunk-recall__form {
  display: grid;
  gap: 6px;
}

.chunk-recall__form input[type='search'],
.chunk-recall__form button {
  font: inherit;
}

.chunk-recall__form input[type='search'] {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #d7ddd3;
  border-radius: 8px;
}

.chunk-recall__form button {
  padding: 6px 10px;
  border: 1px solid #2f4f6f;
  border-radius: 8px;
  background: #2f4f6f;
  color: #fff;
}

.chunk-recall__form button:disabled {
  opacity: 0.6;
}

.chunk-recall__hits {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chunk-recall__hits button {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px;
  border: 1px solid #d7ddd3;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  text-align: left;
}

.chunk-recall__title {
  font-weight: 700;
}
</style>
