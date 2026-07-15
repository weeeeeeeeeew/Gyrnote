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
</script>

<template>
  <aside class="edge-inspector" aria-label="关系检查器">
    <p class="eyebrow">有向关系</p>
    <p class="endpoint">{{ sourceText }}</p>
    <span class="direction" aria-hidden="true">↓</span>
    <p class="endpoint">{{ targetText }}</p>

    <form class="edge-inspector__form" @submit.prevent="handleSubmit">
      <label for="thought-edge-type">关系类型</label>
      <select id="thought-edge-type" v-model="draftType">
        <option v-for="edgeType in THOUGHT_EDGE_TYPES" :key="edgeType" :value="edgeType">
          {{ edgeType }}
        </option>
      </select>
      <button type="submit" :disabled="!canSave">保存关系</button>
    </form>

    <dl>
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
  </aside>
</template>

<style scoped>
.edge-inspector {
  padding: 24px;
  border-left: 1px solid #deddd4;
  background: #f8f6ef;
}

.eyebrow,
.edge-inspector label,
.edge-inspector dt {
  color: #777d73;
  font-size: 12px;
}

.eyebrow {
  margin-bottom: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.endpoint {
  padding: 10px;
  border: 1px solid #deddd4;
  border-radius: 10px;
  line-height: 1.4;
  background: #ffffff;
}

.direction {
  display: block;
  margin: 4px 0;
  color: #57735b;
  text-align: center;
}

.edge-inspector__form {
  display: grid;
  gap: 10px;
  margin: 22px 0 24px;
}

.edge-inspector select {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #c9cbc3;
  border-radius: 10px;
  color: inherit;
  font: inherit;
  background: #ffffff;
}

.edge-inspector select:focus-visible {
  border-color: #57735b;
  outline: 3px solid rgb(87 115 91 / 16%);
}

.edge-inspector button {
  justify-self: end;
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
  background: #48634d;
}

.edge-inspector button:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}

.edge-inspector dl {
  display: grid;
  gap: 14px;
}

.edge-inspector dl div {
  display: grid;
  gap: 2px;
}

.edge-inspector dd {
  margin: 0;
}

@media (max-width: 760px) {
  .edge-inspector {
    border-top: 1px solid #deddd4;
    border-left: 0;
  }
}
</style>
