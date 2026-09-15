import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useThoughtModelWorkbenchStore } from './workbench'

vi.mock('../api/patch-reviews-api', () => ({
  startPatchReview: vi.fn(),
  resumePatchReview: vi.fn(),
}))

vi.mock('../api/instruction-patches-api', () => ({
  compileInstructionPatch: vi.fn(),
}))

import { compileInstructionPatch } from '../api/instruction-patches-api'
import { resumePatchReview, startPatchReview } from '../api/patch-reviews-api'

describe('patch review HTTP gate', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(startPatchReview).mockReset()
    vi.mocked(resumePatchReview).mockReset()
    vi.mocked(compileInstructionPatch).mockReset()
  })

  it('does not write the confirmed model until resume returns approved', async () => {
    const workbench = useThoughtModelWorkbenchStore()
    workbench.pendingInstructionPatch = {
      id: 'patch-delete-only',
      noteId: workbench.model.noteId,
      baseModelVersion: workbench.model.version,
      reason: 'test delete',
      ops: [{ op: 'delete_node', nodeId: 'evidence-shared-workflow' }],
    }
    const beforeCount = workbench.model.nodes.length
    vi.mocked(startPatchReview).mockResolvedValue({
      threadId: 'thread-1',
      patchId: 'patch-delete-only',
      status: 'awaiting_review',
      ops: [{ op: 'delete_node', nodeId: 'evidence-shared-workflow' }],
    })
    vi.mocked(resumePatchReview).mockResolvedValue({
      threadId: 'thread-1',
      patchId: 'patch-delete-only',
      status: 'rejected',
      ops: [],
    })

    expect(await workbench.approvePendingPatchViaReview()).toBe(false)
    expect(workbench.model.nodes).toHaveLength(beforeCount)
    expect(workbench.pendingInstructionPatch).not.toBeNull()
  })

  it('applies the pending instruction patch only after approved resume', async () => {
    const workbench = useThoughtModelWorkbenchStore()
    workbench.pendingInstructionPatch = {
      id: 'patch-delete-only',
      noteId: workbench.model.noteId,
      baseModelVersion: workbench.model.version,
      reason: 'test delete',
      ops: [{ op: 'delete_node', nodeId: 'evidence-shared-workflow' }],
    }
    vi.mocked(startPatchReview).mockResolvedValue({
      threadId: 'thread-1',
      patchId: 'patch-delete-only',
      status: 'awaiting_review',
      ops: [{ op: 'delete_node', nodeId: 'evidence-shared-workflow' }],
    })
    vi.mocked(resumePatchReview).mockResolvedValue({
      threadId: 'thread-1',
      patchId: 'patch-delete-only',
      status: 'approved',
      ops: [],
    })

    expect(await workbench.approvePendingPatchViaReview()).toBe(true)
    expect(workbench.pendingInstructionPatch).toBeNull()
    expect(workbench.model.nodes.some((node) => node.id === 'evidence-shared-workflow')).toBe(false)
    expect(resumePatchReview).toHaveBeenCalledWith({ threadId: 'thread-1', decision: 'approve' })
  })

  it('puts an instruction compile onto the instruction lane without writing the confirmed model', async () => {
    const workbench = useThoughtModelWorkbenchStore()
    const beforeCount = workbench.model.nodes.length
    vi.mocked(compileInstructionPatch).mockResolvedValue({
      id: 'patch-nl-note-1-v1',
      noteId: workbench.model.noteId,
      baseModelVersion: workbench.model.version,
      reason: '把论点改成结构必须回到笔记',
      ops: [{ op: 'update_node_text', nodeId: 'claim-product-engineer', text: '结构必须回到笔记' }],
    })

    expect(await workbench.compileInstructionPatchFromInstruction('把论点改成结构必须回到笔记')).toBe(
      true,
    )
    expect(workbench.model.nodes).toHaveLength(beforeCount)
    expect(workbench.pendingInstructionPatch?.id).not.toBe(workbench.model.id)
    expect(workbench.pendingInstructionPatch?.ops).toEqual([
      { op: 'update_node_text', nodeId: 'claim-product-engineer', text: '结构必须回到笔记' },
    ])
    expect(workbench.instructionPatchFeedback).toContain('已生成 1 条候选操作')
    expect(workbench.pendingNoteChangePatch).toBeNull()
    expect(startPatchReview).not.toHaveBeenCalled()
  })

  it('does not apply when instruction compile fails', async () => {
    const workbench = useThoughtModelWorkbenchStore()
    vi.mocked(compileInstructionPatch).mockRejectedValue(new Error('501'))

    expect(await workbench.compileInstructionPatchFromInstruction('改图')).toBe(false)
    expect(workbench.pendingInstructionPatch).toBeNull()
    expect(workbench.instructionPatchFeedback).toContain('501')
  })

  it('does not start interrupt review when staging a note-change patch', () => {
    const workbench = useThoughtModelWorkbenchStore()
    workbench.pendingInstructionPatch = {
      id: 'patch-nl',
      noteId: workbench.model.noteId,
      baseModelVersion: workbench.model.version,
      reason: 'nl',
      ops: [{ op: 'update_node_text', nodeId: 'claim-product-engineer', text: '结构必须回到笔记' }],
    }
    workbench.loadFixtureModelPatch()

    expect(workbench.pendingInstructionPatch?.id).toBe('patch-nl')
    expect(workbench.pendingNoteChangePatch).not.toBeNull()
    expect(startPatchReview).not.toHaveBeenCalled()
  })
})
