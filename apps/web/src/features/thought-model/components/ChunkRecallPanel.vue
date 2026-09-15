<script setup lang="ts">
import { ref } from 'vue'

import { ApiError } from '@/api/http-client'

import {
  recallGraphPassages,
  type GraphRagEmptyReason,
  type GraphRagNodeHit,
  type GraphRagPassageHit,
} from '../api/graph-recalls-api'
import { recallNoteChunks, type NoteChunkHit } from '../api/note-chunk-recalls-api'
import WorkbenchModal from './WorkbenchModal.vue'

const props = defineProps<{
  noteId: string | null
}>()

const emit = defineEmits<{
  openNote: [noteId: string]
}>()

const isOpen = ref(false)
const query = ref('')
const currentNoteOnly = ref(Boolean(props.noteId))
const fullCorpus = ref(false)
const busy = ref(false)
const errorMessage = ref<string | null>(null)
const hasResult = ref(false)
const nodes = ref<GraphRagNodeHit[]>([])
const hits = ref<Array<GraphRagPassageHit | NoteChunkHit>>([])
const scopedBlockCount = ref(0)
const indexedChunkCount = ref(0)
const emptyReason = ref<GraphRagEmptyReason | null>(null)
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
    const noteIds = currentNoteOnly.value && props.noteId ? [props.noteId] : undefined
    if (fullCorpus.value) {
      const result = await recallNoteChunks({ query: text, k: 5, noteIds })
      if (seq !== requestSeq) {
        return
      }
      hasResult.value = true
      nodes.value = []
      hits.value = result.hits
      scopedBlockCount.value = 0
      indexedChunkCount.value = result.indexedChunkCount
      emptyReason.value = null
      return
    }
    const result = await recallGraphPassages({ query: text, k: 5, noteIds })
    if (seq !== requestSeq) {
      return
    }
    hasResult.value = true
    nodes.value = result.nodes
    hits.value = result.hits
    scopedBlockCount.value = result.scopedBlockCount
    indexedChunkCount.value = 0
    emptyReason.value = result.emptyReason
  } catch (error) {
    if (seq !== requestSeq) {
      return
    }
    hasResult.value = true
    nodes.value = []
    hits.value = []
    scopedBlockCount.value = 0
    indexedChunkCount.value = 0
    emptyReason.value = null
    errorMessage.value = formatRecallError(error)
  } finally {
    if (seq === requestSeq) {
      busy.value = false
    }
  }
}

function formatRecallError(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return '双层召回需要独立 embeddings 配置。请在「模型密钥」向量栏填写千问 embedding Key 和模型名，不要用结构查询代替。'
  }
  if (error instanceof ApiError && error.status === 400) {
    return '查询无效，或入库向量与查询不是同一模型/维度。请重新保存笔记再建索引。'
  }
  if (error instanceof ApiError && error.status === 502) {
    return readApiDetail(error) ?? '向量服务调用失败。保存或召回时才会请求 embedding。'
  }
  return error instanceof Error ? error.message : '召回失败'
}

function emptyStatusText(): string {
  if (fullCorpus.value) {
    if (indexedChunkCount.value === 0) {
      return '当前范围正文里也没有这几个字，向量索引也是空的。先确认笔记已保存；向量栏失败不会再挡住保存，但索引可能仍空。'
    }
    return `正文不含这几个字，索引里有 ${indexedChunkCount.value} 块也和这句不够像。换原文用词，例如 T0。`
  }
  if (emptyReason.value === 'no_confirmed_nodes') {
    return '当前范围没有已确认或锁定的节点，双层召回没有摘要可走。先审阅锁定结构，或勾选「全文补漏」。'
  }
  if (emptyReason.value === 'no_similar_nodes') {
    return '确认图里没有和这句够像的节点。换问法，或勾选「全文补漏」扫全部正文块。'
  }
  if (emptyReason.value === 'no_anchored_blocks') {
    return '找到了相关节点，但它们还没有锚定到正文块。给这些节点补锚点后再召回。'
  }
  if (scopedBlockCount.value > 0) {
    return `相关节点锚定了 ${scopedBlockCount.value} 块原文，但里面没有这句。换问法，或勾选「全文补漏」。`
  }
  return '没有召回到原文。换问法，或勾选「全文补漏」。'
}

function hitKey(hit: GraphRagPassageHit | NoteChunkHit): string {
  return `${hit.noteId}:${hit.blockId}`
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
  <section class="chunk-recall" aria-label="双层原文召回">
    <button
      class="chunk-recall__toggle"
      type="button"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      召回原文
    </button>
    <WorkbenchModal :open="isOpen" size="tall" title="召回原文" @close="isOpen = false">
    <p class="chunk-recall__lead">
      默认双层：先用确认图节点当摘要索引（向量相近或原文包含），再只在这些节点锚定的正文块里检索。这样不用扫全部笔记切块。要生成回答请用「笔记问答」。「结构查询」仍是查论证缺口。勾选「全文补漏」才会绕过图、扫全部正文块。
    </p>
    <form class="chunk-recall__form" @submit.prevent="runRecall">
      <input
        v-model="query"
        type="search"
        name="chunk-recall-query"
        aria-label="原文召回查询"
        placeholder="问结构或原文里的词，例如 T0"
        :disabled="busy"
      />
      <label class="chunk-recall__scope">
        <input
          v-model="currentNoteOnly"
          type="checkbox"
          name="current-note-only"
          :disabled="busy || !noteId"
        />
        仅当前笔记
      </label>
      <label class="chunk-recall__scope">
        <input v-model="fullCorpus" type="checkbox" name="full-corpus" :disabled="busy" />
        全文补漏
      </label>
      <button type="submit" :disabled="busy || !query.trim()">
        {{ busy ? '召回中…' : '召回原文' }}
      </button>
    </form>
    <p v-if="errorMessage" class="chunk-recall__error" role="alert">{{ errorMessage }}</p>
    <template v-else-if="hasResult">
      <p v-if="nodes.length > 0" class="chunk-recall__section">相关节点</p>
      <ol v-if="nodes.length > 0" class="chunk-recall__hits">
        <li v-for="node in nodes" :key="`${node.noteId}:${node.nodeId}`">
          <button type="button" @click="emit('openNote', node.noteId)">
            <span class="chunk-recall__title">{{ node.noteTitle }} · {{ node.nodeType }}</span>
            <span>{{ node.nodeText }}</span>
            <span class="chunk-recall__score">{{ node.score.toFixed(3) }}</span>
          </button>
        </li>
      </ol>
      <p v-if="hits.length > 0" class="chunk-recall__section">锚定原文</p>
      <ol v-if="hits.length > 0" class="chunk-recall__hits">
        <li v-for="hit in hits" :key="hitKey(hit)">
          <button type="button" @click="emit('openNote', hit.noteId)">
            <span class="chunk-recall__title">{{ hit.noteTitle }}</span>
            <span>{{ hit.text }}</span>
            <span class="chunk-recall__score">{{ hit.score.toFixed(3) }}</span>
          </button>
        </li>
      </ol>
      <p v-else class="chunk-recall__empty" role="status">{{ emptyStatusText() }}</p>
    </template>
    </WorkbenchModal>
  </section>
</template>

<style scoped>
.chunk-recall {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gyre-line);
  background: var(--gyre-surface);
}

.chunk-recall__toggle {
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

.chunk-recall__lead,
.chunk-recall__error,
.chunk-recall__empty,
.chunk-recall__score,
.chunk-recall__scope,
.chunk-recall__section {
  margin: 0;
  color: var(--gyre-deep);
  font-size: 12px;
  line-height: 1.5;
}

.chunk-recall__error {
  color: #8a2f2f;
}

.chunk-recall__section {
  font-weight: 700;
}

.chunk-recall__scope {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
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
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
}

.chunk-recall__form button[type='submit'] {
  padding: 6px 10px;
  border: 1px solid var(--gyre);
  border-radius: 8px;
  background: var(--gyre);
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
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  background: #fff;
  font: inherit;
  text-align: left;
}

.chunk-recall__title {
  font-weight: 700;
}
</style>
