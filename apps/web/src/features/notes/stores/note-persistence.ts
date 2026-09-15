import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError } from '@/api/http-client'

import { createNote, getNote, saveNoteVersion, type NoteReadResponse } from '../api/notes-api'
import {
  toNoteCreatePayload,
  toNoteVersionCreatePayload,
  type NoteVersionSaveInput,
} from '../domain/note-persistence'

export type NoteSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export type NoteLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

export const useNotePersistenceStore = defineStore('note-persistence', () => {
  const noteId = ref<string | null>(null)
  const revision = ref<number | null>(null)
  const status = ref<NoteSaveStatus>('dirty')
  const errorMessage = ref<string | null>(null)
  const conflictRevision = ref<number | null>(null)
  const loadStatus = ref<NoteLoadStatus>('idle')
  const loadErrorMessage = ref<string | null>(null)
  const indexWarning = ref<string | null>(null)

  const isSaving = computed(() => status.value === 'saving')

  function markDirty(): void {
    if (status.value !== 'saving') {
      status.value = 'dirty'
    }
    errorMessage.value = null
    conflictRevision.value = null
    indexWarning.value = null
  }

  async function save(input: NoteVersionSaveInput): Promise<void> {
    if (isSaving.value) {
      return
    }

    status.value = 'saving'
    errorMessage.value = null
    conflictRevision.value = null
    indexWarning.value = null

    try {
      const response = noteId.value
        ? await saveNoteVersion(
            noteId.value,
            toNoteVersionCreatePayload({
              ...input,
              expectedRevision: revision.value ?? input.expectedRevision,
            }),
          )
        : await createNote(toNoteCreatePayload(input))

      noteId.value = response.id
      revision.value = response.revision
      status.value = 'saved'
      indexWarning.value = response.chunkIndexError
        ? `笔记已保存，但向量索引未更新：${response.chunkIndexError}`
        : null
    } catch (error) {
      status.value = 'error'
      if (error instanceof ApiError && error.status === 409) {
        const currentRevision = readCurrentRevision(error.data)
        conflictRevision.value = currentRevision
        errorMessage.value = currentRevision
          ? `笔记已被更新，请重新加载第 ${currentRevision} 版后再保存`
          : '笔记已被更新，请重新加载后再保存'
      } else if (error instanceof ApiError && error.status === 404) {
        errorMessage.value = '笔记不存在或已无权访问'
      } else if (error instanceof ApiError && error.status === 422) {
        errorMessage.value = describeValidationError(error.data)
      } else if (error instanceof Error && error.message) {
        errorMessage.value = error.message
      } else {
        errorMessage.value = '保存失败，请检查网络后重试'
      }
      throw error
    }
  }

  async function load(requestedNoteId: string): Promise<NoteReadResponse> {
    loadStatus.value = 'loading'
    loadErrorMessage.value = null

    try {
      const note = await getNote(requestedNoteId)
      noteId.value = note.id
      revision.value = note.revision
      status.value = 'saved'
      loadStatus.value = 'loaded'
      return note
    } catch (error) {
      loadStatus.value = 'error'
      loadErrorMessage.value = error instanceof ApiError && error.status === 404
        ? '笔记不存在或已无权访问'
        : '加载笔记失败，请检查网络后重试'
      throw error
    }
  }

  function reset(): void {
    noteId.value = null
    revision.value = null
    status.value = 'dirty'
    errorMessage.value = null
    conflictRevision.value = null
    loadStatus.value = 'idle'
    loadErrorMessage.value = null
    indexWarning.value = null
  }

  return {
    noteId,
    revision,
    status,
    errorMessage,
    conflictRevision,
    loadStatus,
    loadErrorMessage,
    indexWarning,
    isSaving,
    markDirty,
    save,
    load,
    reset,
  }
})

function readCurrentRevision(data: unknown): number | null {
  if (!isRecord(data) || !isRecord(data.detail)) {
    return null
  }

  const currentRevision = data.detail.current_revision
  return typeof currentRevision === 'number' && Number.isInteger(currentRevision) ? currentRevision : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeValidationError(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.detail)) {
    return '保存内容未通过校验'
  }

  const first = data.detail[0]
  if (!isRecord(first) || typeof first.msg !== 'string' || first.msg.trim() === '') {
    return '保存内容未通过校验'
  }

  const location = formatValidationLocation(first.loc)
  return location
    ? `保存内容未通过校验：${location} — ${first.msg}`
    : `保存内容未通过校验：${first.msg}`
}

function formatValidationLocation(loc: unknown): string {
  if (!Array.isArray(loc)) {
    return ''
  }

  return loc
    .filter((part) => part !== 'body')
    .map((part) => String(part))
    .join('.')
}
