import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'

const DEFAULT_DELAY_MS = 8_000

/**
 * Coalesces local edits into one save. A failed request is deliberately not
 * retried automatically: the persistence store owns the visible error and the
 * user decides when to retry.
 */
export function useNoteAutoSave(save: () => Promise<void>, delayMs = DEFAULT_DELAY_MS) {
  const isPending = ref(false)
  const isRunning = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let saveAfterCurrentRequest = false

  function clearScheduledSave(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  async function runSave(): Promise<boolean> {
    if (isRunning.value) {
      saveAfterCurrentRequest = true
      return false
    }

    isPending.value = false
    isRunning.value = true
    let succeeded = false

    try {
      await save()
      succeeded = true
    } catch {
      // The persistence store has already captured an actionable error message.
    } finally {
      isRunning.value = false

      if (succeeded && saveAfterCurrentRequest) {
        saveAfterCurrentRequest = false
        schedule()
      } else {
        saveAfterCurrentRequest = false
      }
    }

    return succeeded
  }

  function schedule(): void {
    isPending.value = true

    if (isRunning.value) {
      saveAfterCurrentRequest = true
      return
    }

    clearScheduledSave()
    timer = setTimeout(() => {
      timer = undefined
      void runSave()
    }, delayMs)
  }

  async function saveNow(): Promise<void> {
    clearScheduledSave()
    isPending.value = false
    await runSave()
  }

  function cancel(): void {
    clearScheduledSave()
    isPending.value = false
    saveAfterCurrentRequest = false
  }

  if (getCurrentScope()) {
    onScopeDispose(cancel)
  }

  return {
    isPending: computed(() => isPending.value),
    isRunning: computed(() => isRunning.value),
    schedule,
    saveNow,
    cancel,
  }
}
