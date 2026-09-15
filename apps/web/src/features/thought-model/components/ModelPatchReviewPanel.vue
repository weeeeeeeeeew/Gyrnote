<script setup lang="ts">
import type { ModelPatch } from '../domain/model-patch'

const props = defineProps<{
  patch: ModelPatch | null
  feedback: string | null
  reviewBusy?: boolean
}>()

const emit = defineEmits<{
  proposeFromNote: []
  acceptOp: [index: number]
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
</script>

<template>
  <section class="model-patch-review" aria-label="原文变更 ModelPatch">
    <header class="model-patch-review__header">
      <h2>原文变更 patch</h2>
      <div class="model-patch-review__actions">
        <button type="button" :disabled="reviewBusy" @click="emit('proposeFromNote')">
          从原文变更生成 patch
        </button>
      </div>
    </header>

    <p v-if="props.feedback" class="model-patch-review__feedback" role="status">
      {{ props.feedback }}
    </p>

    <p v-if="!props.patch" class="model-patch-review__empty">
      尚无候选 patch。对照原文锚点失效生成；可逐条接受，也可顶栏批准剩余操作。批准前不会写确认图。图与原文意合而不形合，不必覆盖全文。
    </p>

    <template v-else>
      <p class="model-patch-review__meta">
        {{ props.patch.reason }} · base v{{ props.patch.baseModelVersion }} ·
        {{ props.patch.ops.length }} ops
      </p>
      <ol class="model-patch-review__ops">
        <li v-for="(op, index) in props.patch.ops" :key="`${op.op}-${index}`">
          <div>
            <code>{{ op.op }}</code>
            {{ summarizeOp(op) }}
          </div>
          <button
            type="button"
            :disabled="reviewBusy"
            @click="emit('acceptOp', index)"
          >
            接受
          </button>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.model-patch-review {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 14px 16px 16px;
  border: 0;
  background: var(--gyre-mist);
}

.model-patch-review__header {
  display: grid;
  gap: 10px;
}

.model-patch-review__header h2 {
  margin: 0;
  color: var(--gyre-ink);
  font-size: 15px;
  font-weight: 700;
}

.model-patch-review__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.model-patch-review__actions > button,
.model-patch-review__ops button {
  padding: 7px 12px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
}

.model-patch-review__actions > button:disabled,
.model-patch-review__ops button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.model-patch-review__meta,
.model-patch-review__empty,
.model-patch-review__feedback {
  margin: 0;
  color: var(--gyre-deep);
  font-size: 13px;
}

.model-patch-review__feedback {
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--gyre-ink);
  background: var(--gyre-mist);
}

.model-patch-review__ops {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.model-patch-review__ops li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--gyre-line);
  border-radius: 10px;
  background: #ffffff;
}

.model-patch-review__ops code {
  margin-right: 8px;
  color: var(--gyre);
  font-weight: 700;
}
</style>
