<script setup lang="ts">
defineProps<{
  hasCandidate: boolean
}>()
</script>

<template>
  <p class="confirmed-caption" role="note" aria-label="确认模型说明">
    <strong>确认模型</strong>
    · 图/大纲只显示已接受结构
    <template v-if="hasCandidate">
      ；还有待审阅候选时，请切到「候选模型」Tab
    </template>
    <template v-else> ；生成候选不会自动改这里 </template>
  </p>
</template>

<style scoped>
.confirmed-caption {
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gyre-line);
  color: var(--gyre-deep);
  font-size: 12px;
  line-height: 1.4;
  background: var(--gyre-mist);
}

.confirmed-caption strong {
  color: var(--gyre-ink);
  font-weight: 700;
}
</style>
