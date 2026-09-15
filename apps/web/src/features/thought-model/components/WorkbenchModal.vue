<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title: string
    size?: 'default' | 'tall' | 'form'
  }>(),
  {
    size: 'default',
  },
)

defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="wb-modal" role="dialog" :aria-label="title" aria-modal="true">
      <button class="wb-modal__backdrop" type="button" aria-label="关闭弹窗" @click="$emit('close')" />
      <div class="wb-modal__panel" :class="`wb-modal__panel--${size}`">
        <header class="wb-modal__header">
          <h2>{{ title }}</h2>
          <button type="button" @click="$emit('close')">关闭</button>
        </header>
        <div class="wb-modal__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wb-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  color: var(--gyre-ink);
}

.wb-modal__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(12 58 82 / 28%);
  cursor: pointer;
}

.wb-modal__panel {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(420px, 100%);
  max-height: min(80vh, 640px);
  overflow: hidden;
  border: 1px solid var(--gyre-line);
  border-radius: 16px;
  color: var(--gyre-ink);
  background: #ffffff;
  box-shadow: 0 18px 48px rgb(12 58 82 / 18%);
}

.wb-modal__panel--tall {
  width: min(520px, 100%);
  min-height: min(88vh, 720px);
  max-height: min(92vh, 880px);
}

.wb-modal__panel--form {
  width: min(440px, 100%);
  min-height: 0;
  max-height: min(88vh, 720px);
}

.wb-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--gyre-line);
}

.wb-modal__header h2 {
  margin: 0;
  color: var(--gyre-ink);
  font-size: 15px;
  font-weight: 700;
}

.wb-modal__header button,
.wb-modal__body :deep(button[type='submit']),
.wb-modal__body :deep(.structure-query__actions button) {
  font: inherit;
}

.wb-modal__header button {
  padding: 4px 8px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-deep);
  background: #ffffff;
  cursor: pointer;
}

.wb-modal__body {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  padding: 12px 14px 16px;
  overflow: auto;
  color: var(--gyre-ink);
}

.wb-modal__body :deep(input:not([type='checkbox']):not([type='radio']):not([type='hidden'])),
.wb-modal__body :deep(select),
.wb-modal__body :deep(textarea) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  background-color: #ffffff;
  appearance: none;
}

.wb-modal__body :deep(input[type='checkbox']),
.wb-modal__body :deep(input[type='radio']) {
  display: inline-block;
  width: 14px;
  height: 14px;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 1px solid var(--gyre-line);
  border-radius: 3px;
  vertical-align: middle;
  appearance: auto;
  accent-color: var(--gyre);
}

.wb-modal__body :deep(select) {
  padding-right: 28px;
  background-color: #ffffff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%230a5d86' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.wb-modal__body :deep(textarea) {
  min-height: 72px;
  resize: vertical;
}
</style>
