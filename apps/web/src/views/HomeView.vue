<script setup lang="ts">
import TheWelcome from '../components/TheWelcome.vue'
import { useHealthApiV1HealthGet } from '@/generated/health-api'

const { isPending, isFetching, isError, data, refetch } = useHealthApiV1HealthGet()
</script>

<template>
  <main>
    <TheWelcome />
    <div v-if="isPending">首次检查</div>
    <div v-else-if="isFetching">正在重新检查</div>
    <div v-else-if="isError">后端不可用</div>
    <div v-else>
      status: {{ data?.data.status }} environment: {{ data?.data.environment }} version:
      {{ data?.data.version }}
    </div>
    <button @click="() => refetch()" :disabled="isFetching">重新检查</button>
  </main>
</template>
