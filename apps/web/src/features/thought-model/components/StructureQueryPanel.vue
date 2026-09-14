<script setup lang="ts">
import { ref } from 'vue'

import { ApiError } from '@/api/http-client'

import {
  STRUCTURE_QUERY_KINDS,
  runStructureQuery,
  type StructureQueryHit,
  type StructureQueryKind,
} from '../api/structure-queries-api'

const labels: Record<StructureQueryKind, string> = {
  unsupported_claims: '薄弱论点',
  shared_assumption: '共同前提',
  open_questions: '未闭环问题',
}

const isOpen = ref(false)
const busyKind = ref<StructureQueryKind | null>(null)
const errorMessage = ref<string | null>(null)
const resultKind = ref<StructureQueryKind | null>(null)
const hits = ref<StructureQueryHit[]>([])

const emit = defineEmits<{
  openNote: [noteId: string]
}>()

async function runKind(kind: StructureQueryKind) {
  busyKind.value = kind
  errorMessage.value = null
  try {
    const result = await runStructureQuery(kind)
    resultKind.value = result.kind
    hits.value = result.hits
  } catch (error) {
    hits.value = []
    resultKind.value = kind
    errorMessage.value = error instanceof ApiError && error.status === 501
      ? '结构匹配还没实现'
      : error instanceof Error
        ? error.message
        : '结构查询失败'
  } finally {
    busyKind.value = null
  }
}
</script>

<template>
  <section class="structure-query" aria-label="跨笔记结构查询">
    <button
      class="structure-query__toggle"
      type="button"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      {{ isOpen ? '收起结构查询' : '结构查询' }}
    </button>
    <template v-if="isOpen">
    <p class="structure-query__lead">图只过滤结构，结果里的文字来自笔记。</p>
    <div class="structure-query__actions">
      <button
        v-for="kind in STRUCTURE_QUERY_KINDS"
        :key="kind"
        type="button"
        :disabled="busyKind !== null"
        @click="runKind(kind)"
      >
        {{ busyKind === kind ? '查询中…' : labels[kind] }}
      </button>
    </div>
    <p v-if="errorMessage" class="structure-query__error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="resultKind && hits.length === 0" class="structure-query__empty" role="status">
      没有命中
    </p>
    <ol v-else-if="hits.length > 0" class="structure-query__hits">
      <li v-for="hit in hits" :key="`${hit.noteId}:${hit.nodeId}`">
        <button type="button" @click="emit('openNote', hit.noteId)">
          <span class="structure-query__title">{{ hit.noteTitle }}</span>
          <span>{{ hit.nodeText }}</span>
          <span class="structure-query__reason">{{ hit.reason }}</span>
        </button>
      </li>
    </ol>
    </template>
  </section>
</template>

<style scoped>
.structure-query {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid #deddd4;
  background: #f4f1e8;
}

.structure-query__toggle {
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

.structure-query__lead,
.structure-query__error,
.structure-query__empty,
.structure-query__reason {
  margin: 0;
  color: #5f675b;
  font-size: 12px;
}

.structure-query__error {
  color: #8a2f2f;
}

.structure-query__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.structure-query__actions button,
.structure-query__hits button {
  font: inherit;
  text-align: left;
}

.structure-query__actions button {
  padding: 6px 10px;
  border: 1px solid #2f4f6f;
  border-radius: 8px;
  background: #2f4f6f;
  color: #fff;
}

.structure-query__actions button:disabled {
  opacity: 0.6;
}

.structure-query__hits {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.structure-query__hits button {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px;
  border: 1px solid #d7ddd3;
  border-radius: 8px;
  background: #fff;
}

.structure-query__title {
  font-weight: 700;
}
</style>
