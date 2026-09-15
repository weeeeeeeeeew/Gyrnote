<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { THOUGHT_EDGE_TYPES, type ThoughtEdge, type ThoughtEdgeType } from '../domain/thought-model'

const props = defineProps<{
  edge: ThoughtEdge
  sourceText: string
  targetText: string
}>()

const emit = defineEmits<{
  save: [edgeType: ThoughtEdgeType]
  delete: []
}>()

const draftType = ref<ThoughtEdgeType>('supports')

/**
 * M1 巩固检查点 1：切换关系时，把当前关系类型同步到本地草稿。
 *
 * 请独立复用 ThoughtNodeInspector 中已经掌握的 watch 模式。
 */
watch(
  () => props.edge,
  (edge) => {
    draftType.value = edge.type
  },
  { immediate: true },
)

/**
 * M1 巩固检查点 2：只有关系类型真正变化时才允许保存。
 */
const canSave = computed(() => {
  return draftType.value !== props.edge.type
})

function handleSubmit() {
  if (!canSave.value) {
    return
  }

  emit('save', draftType.value)
}

function handleDelete() {
  emit('delete')
}
</script>

<template>
  <aside class="edge-inspector" aria-label="关系检查器">
    <div class="edge-inspector__layout">
      <div class="edge-inspector__main">
        <p class="eyebrow">有向关系</p>
        <div class="edge-inspector__endpoints" aria-label="关系端点">
          <p class="endpoint">{{ sourceText }}</p>
          <span class="direction" aria-hidden="true">→</span>
          <p class="endpoint">{{ targetText }}</p>
        </div>

        <form class="edge-inspector__form" @submit.prevent="handleSubmit">
          <label for="thought-edge-type">关系类型</label>
          <div class="edge-inspector__type-row">
            <select id="thought-edge-type" v-model="draftType">
              <option v-for="edgeType in THOUGHT_EDGE_TYPES" :key="edgeType" :value="edgeType">
                {{ edgeType }}
              </option>
            </select>
            <div class="edge-inspector__actions">
              <button
                type="button"
                class="edge-inspector__delete"
                aria-label="删除关系"
                @click="handleDelete"
              >
                删除
              </button>
              <button type="submit" :disabled="!canSave">保存关系</button>
            </div>
          </div>
        </form>
      </div>

      <dl class="edge-inspector__meta">
        <div>
          <dt>来源</dt>
          <dd>{{ edge.origin }}</dd>
        </div>
        <div>
          <dt>显式性</dt>
          <dd>{{ edge.explicitness }}</dd>
        </div>
        <div>
          <dt>审阅状态</dt>
          <dd>{{ edge.reviewStatus }}</dd>
        </div>
      </dl>
    </div>
  </aside>
</template>

<style scoped>
.edge-inspector {
  padding: 12px 16px;
  border-top: 1px solid var(--gyre-line);
  background: var(--gyre-surface);
}

.edge-inspector__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(200px, 0.7fr);
  gap: 16px 20px;
  align-items: start;
}

.eyebrow,
.edge-inspector label,
.edge-inspector dt {
  color: var(--gyre-deep);
  font-size: 12px;
}

.eyebrow {
  margin: 0 0 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.edge-inspector__endpoints {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.endpoint {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  line-height: 1.35;
  background: #ffffff;
  overflow-wrap: anywhere;
}

.direction {
  color: var(--gyre);
  font-weight: 700;
}

.edge-inspector__form {
  display: grid;
  gap: 6px;
}

.edge-inspector__type-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.edge-inspector select {
  flex: 1;
  min-width: 140px;
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: inherit;
  font: inherit;
  background: #ffffff;
}

.edge-inspector select:focus-visible {
  border-color: var(--gyre);
  outline: 3px solid rgb(0 160 232 / 16%);
}

.edge-inspector button {
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
  background: var(--gyre);
}

.edge-inspector__actions {
  display: flex;
  gap: 8px;
}

.edge-inspector__delete {
  color: #6b3a3a;
  background: #f3e4e4;
}

.edge-inspector button:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}

.edge-inspector__meta {
  display: grid;
  gap: 8px;
  margin: 0;
}

.edge-inspector__meta div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
}

.edge-inspector dd {
  margin: 0;
}

@media (max-width: 900px) {
  .edge-inspector__layout {
    grid-template-columns: 1fr;
  }
}
</style>
