<script setup lang="ts">
import type { NoteSummaryResponse } from '../api/notes-api'

defineProps<{
  notes: readonly NoteSummaryResponse[]
  currentNoteId: string | null
  loading: boolean
  errorMessage: string | null
  collapsed: boolean
}>()

const emit = defineEmits<{
  open: [noteId: string]
  create: []
  startExample: []
  toggleCollapse: []
  resizeLibrary: [event: PointerEvent]
}>()
</script>

<template>
  <aside class="note-library" :class="{ 'is-collapsed': collapsed }" aria-label="笔记目录">
    <button
      v-if="collapsed"
      class="note-library__rail"
      type="button"
      aria-expanded="false"
      aria-label="展开目录"
      @click="emit('toggleCollapse')"
    >
      笔记
    </button>

    <template v-else>
      <header class="note-library__header">
        <div class="note-library__title-row">
          <h2>笔记</h2>
          <button
            type="button"
            aria-expanded="true"
            aria-label="收起目录"
            @click="emit('toggleCollapse')"
          >
            收起
          </button>
        </div>
        <div class="note-library__actions">
          <button type="button" aria-label="新建笔记" @click="emit('create')">新建</button>
          <button type="button" aria-label="从示例开始" @click="emit('startExample')">
            从示例开始
          </button>
        </div>
      </header>

      <p v-if="loading" class="note-library__status" role="status">加载目录…</p>
      <p v-else-if="errorMessage" class="note-library__error" role="alert">{{ errorMessage }}</p>
      <p v-else-if="notes.length === 0" class="note-library__status">还没有保存过的笔记。</p>
      <ul v-else class="note-library__list">
        <li v-for="note in notes" :key="note.id">
          <button
            type="button"
            :class="{ 'is-active': note.id === currentNoteId }"
            @click="emit('open', note.id)"
          >
            <span class="note-library__title">{{ note.title }}</span>
            <span class="note-library__meta">r{{ note.revision }}</span>
          </button>
        </li>
      </ul>
    </template>

    <button
      v-if="!collapsed"
      class="pane-handle"
      type="button"
      aria-label="调整目录宽度"
      @pointerdown="emit('resizeLibrary', $event)"
    />
  </aside>
</template>

<style scoped>
.note-library {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--gyre-line);
  background: var(--gyre-surface);
}

.note-library.is-collapsed {
  align-items: center;
  justify-content: center;
}

.note-library__rail {
  height: min(160px, 40%);
  padding: 12px 0;
  border: 0;
  color: var(--gyre-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.18em;
  writing-mode: vertical-rl;
  cursor: pointer;
  background: transparent;
}

.note-library__header {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px 12px 10px;
}

.note-library__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.note-library__header h2 {
  margin: 0;
  color: var(--gyre-ink);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.note-library__title-row button {
  padding: 4px 8px;
  border: 1px solid var(--gyre-line);
  border-radius: 6px;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  background: #ffffff;
}

.note-library__actions {
  display: grid;
  gap: 6px;
}

.note-library__actions button {
  padding: 7px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
}

.note-library__status,
.note-library__error {
  margin: 0;
  padding: 0 12px 12px;
  color: var(--gyre-deep);
  font-size: 12px;
}

.note-library__error {
  color: #a23d35;
}

.note-library__list {
  display: grid;
  align-content: start;
  gap: 4px;
  min-height: 0;
  margin: 0;
  padding: 0 8px 12px;
  overflow: auto;
  list-style: none;
}

.note-library__list button {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
}

.note-library__list button:hover,
.note-library__list button.is-active {
  background: var(--gyre-mist);
}

.note-library__title {
  overflow: hidden;
  color: var(--gyre-ink);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-library__meta {
  color: var(--gyre-deep);
  font-size: 11px;
}

.pane-handle {
  position: absolute;
  z-index: 3;
  top: 0;
  right: -3px;
  width: 8px;
  height: 100%;
  padding: 0;
  border: 0;
  cursor: col-resize;
  background: transparent;
}

.pane-handle:hover,
.pane-handle:focus-visible {
  background: rgb(0 160 232 / 18%);
}

@media (max-width: 760px) {
  .pane-handle {
    display: none;
  }
}
</style>
