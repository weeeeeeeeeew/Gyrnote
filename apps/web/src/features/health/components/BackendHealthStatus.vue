<script setup lang="ts">
import { useHealthApiV1HealthGet } from '@/generated/health-api'

defineProps<{
  compact?: boolean
}>()

const { isPending, isFetching, isError, data, refetch } = useHealthApiV1HealthGet()
</script>

<template>
  <div class="health-status" :class="{ 'health-status--compact': compact }" aria-live="polite">
    <span v-if="isPending">检查中</span>
    <span v-else-if="isFetching">刷新中</span>
    <span v-else-if="isError" class="is-error">后端异常</span>
    <span v-else :title="`env ${data?.data.environment} · ${data?.data.version}`">
      {{ compact ? data?.data.status : `status: ${data?.data.status}` }}
    </span>
    <button type="button" :disabled="isFetching" @click="() => refetch()">
      {{ compact ? '检查' : '重新检查' }}
    </button>
  </div>
</template>

<style scoped>
.health-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #687064;
  font-size: 12px;
}

.health-status--compact {
  gap: 6px;
  font-size: 11px;
}

.is-error {
  color: #a23d35;
}

button {
  padding: 4px 8px;
  border: 1px solid #d3d2c8;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  background: #fffdf8;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}
</style>
