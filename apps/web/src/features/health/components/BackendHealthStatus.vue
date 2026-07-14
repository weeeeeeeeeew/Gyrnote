<script setup lang="ts">
import { useHealthApiV1HealthGet } from '@/generated/health-api'

const { isPending, isFetching, isError, data, refetch } = useHealthApiV1HealthGet()
</script>

<template>
  <div class="health-status" aria-live="polite">
    <span v-if="isPending">首次检查</span>
    <span v-else-if="isFetching">正在重新检查</span>
    <span v-else-if="isError">后端不可用</span>
    <span v-else>
      status: {{ data?.data.status }} environment: {{ data?.data.environment }} version:
      {{ data?.data.version }}
    </span>
    <button type="button" :disabled="isFetching" @click="() => refetch()">重新检查</button>
  </div>
</template>

<style scoped>
.health-status {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #687064;
  font-size: 12px;
}

button {
  padding: 5px 9px;
  border: 1px solid #d3d2c8;
  border-radius: 8px;
  color: inherit;
  background: #fffdf8;
  cursor: pointer;
}
</style>
