import { afterEach, describe, expect, it, vi } from 'vitest'

import { useNoteAutoSave } from './use-note-auto-save'

describe('useNoteAutoSave', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces consecutive changes into one save after the quiet period', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const autoSave = useNoteAutoSave(save, 800)

    autoSave.schedule()
    await vi.advanceTimersByTimeAsync(500)
    autoSave.schedule()
    await vi.advanceTimersByTimeAsync(799)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledOnce()
    expect(autoSave.isPending.value).toBe(false)
  })

  it('schedules one follow-up save when edits arrive during a successful request', async () => {
    vi.useFakeTimers()
    let resolveFirstSave: (() => void) | undefined
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve
    })
    const save = vi.fn().mockReturnValueOnce(firstSave).mockResolvedValueOnce(undefined)
    const autoSave = useNoteAutoSave(save, 800)

    autoSave.schedule()
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledOnce()

    autoSave.schedule()
    resolveFirstSave?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(800)

    expect(save).toHaveBeenCalledTimes(2)
  })

  it('does not retry a failed save automatically', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValue(new Error('network unavailable'))
    const autoSave = useNoteAutoSave(save, 800)

    autoSave.schedule()
    await vi.advanceTimersByTimeAsync(800)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(save).toHaveBeenCalledOnce()
    expect(autoSave.isPending.value).toBe(false)
  })

  it('cancels a queued automatic save', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const autoSave = useNoteAutoSave(save, 800)

    autoSave.schedule()
    autoSave.cancel()
    await vi.advanceTimersByTimeAsync(800)

    expect(save).not.toHaveBeenCalled()
  })
})
