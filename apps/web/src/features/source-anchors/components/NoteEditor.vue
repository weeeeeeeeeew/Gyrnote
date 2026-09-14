<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { onBeforeUnmount, ref, watch } from 'vue'

import {
  selectionToSourceAnchorInput,
  type SourceSelectionFailureReason,
} from '../adapters/selection-to-source-anchor'
import {
  resolveSourceAnchor,
  type InvalidSourceAnchorReason,
} from '../adapters/resolve-source-anchor'
import { hashSourceQuote } from '../domain/quote-hash'
import {
  createSourceAnchor,
  type IdentifiedSourceAnchor,
  type SourceAnchor,
} from '../domain/source-anchor'
import { StableBlockId } from '../extensions/stable-block-id'

const props = defineProps<{
  content: JSONContent
  canAttachSource: boolean
  activeSourceAnchor: IdentifiedSourceAnchor | null
}>()

const emit = defineEmits<{
  update: [content: JSONContent]
  createAnchor: [anchor: SourceAnchor]
}>()

type FeedbackTone = 'success' | 'warning' | 'error'

interface EditorFeedback {
  message: string
  tone: FeedbackTone
}

const feedback = ref<EditorFeedback | null>(null)

const editor = useEditor({
  content: props.content,
  extensions: [StarterKit, StableBlockId],
  editorProps: {
    attributes: {
      'aria-label': '原文笔记编辑器',
      class: 'note-editor__content',
    },
  },
  onUpdate: ({ editor }) => {
    emit('update', editor.getJSON())
    refreshActiveAnchorStatus()
  },
})

const selectionFailureMessages: Record<SourceSelectionFailureReason, string> = {
  'empty-selection': '请选择一段原文后再关联。',
  'unsupported-selection': '当前不是文本选区，无法创建锚点。',
  'unsupported-block': '当前块类型暂不支持原文锚定。',
  'cross-block-selection': '首版仅支持同一段落或标题内的选区。',
  'missing-block-id': '当前原文块还没有稳定 ID，请重试。',
  'unsupported-inline-content': '选区所在块包含暂不支持的换行或内联节点。',
}

const invalidAnchorMessages: Record<InvalidSourceAnchorReason, string> = {
  'quote-hash-mismatch': '锚点校验信息不一致，无法定位。',
  'invalid-range': '锚点范围不合法，无法定位。',
  'missing-block': '原文块已不存在，锚点已失效。',
  'ambiguous-block-id': '发现重复原文块 ID，无法安全定位。',
  'unsupported-inline-content': '原文块包含暂不支持的内联节点。',
  'quote-not-found': '锚定文本已被修改或删除。',
  'ambiguous-quote': '原文中存在多个相同片段，无法安全迁移锚点。',
}

function handleCreateAnchor() {
  const currentEditor = editor.value

  if (!props.canAttachSource) {
    feedback.value = { message: '请先选择一个思维节点。', tone: 'warning' }
    return
  }

  if (!currentEditor) {
    return
  }

  const selectionResult = selectionToSourceAnchorInput(currentEditor.state.selection)

  if (!selectionResult.ok) {
    feedback.value = {
      message: selectionFailureMessages[selectionResult.reason],
      tone: 'warning',
    }
    return
  }

  const anchor = createSourceAnchor(selectionResult.input, hashSourceQuote)
  emit('createAnchor', anchor)
  feedback.value = { message: `已关联原文：“${anchor.quote}”`, tone: 'success' }
}

function locateActiveAnchor() {
  const currentEditor = editor.value
  const anchor = props.activeSourceAnchor

  if (!currentEditor || !anchor) {
    feedback.value = { message: '当前节点尚未关联原文。', tone: 'warning' }
    return
  }

  const result = resolveSourceAnchor(currentEditor.state.doc, anchor, hashSourceQuote)

  if (result.status === 'invalid') {
    feedback.value = { message: invalidAnchorMessages[result.reason], tone: 'error' }
    return
  }

  const transaction = currentEditor.state.tr
    .setSelection(TextSelection.create(currentEditor.state.doc, result.from, result.to))
    .scrollIntoView()

  currentEditor.view.dispatch(transaction)
  currentEditor.view.focus()
  feedback.value = {
    message:
      result.status === 'valid'
        ? `已定位原文：“${anchor.quote}”`
        : `原文位置已变化，已按唯一文本重新定位：“${anchor.quote}”`,
    tone: result.status === 'valid' ? 'success' : 'warning',
  }
}

function refreshActiveAnchorStatus() {
  const currentEditor = editor.value
  const anchor = props.activeSourceAnchor

  if (!currentEditor || !anchor) {
    return
  }

  const result = resolveSourceAnchor(currentEditor.state.doc, anchor, hashSourceQuote)

  if (result.status === 'invalid') {
    feedback.value = { message: invalidAnchorMessages[result.reason], tone: 'error' }
  } else if (result.status === 'drifted') {
    feedback.value = { message: '原文位置已变化，锚点可以迁移。', tone: 'warning' }
  } else {
    feedback.value = { message: '当前节点的原文锚点有效。', tone: 'success' }
  }
}

watch(
  () => props.content,
  (content) => {
    const currentContent = editor.value?.getJSON()

    if (editor.value && JSON.stringify(currentContent) !== JSON.stringify(content)) {
      editor.value.commands.setContent(content, { emitUpdate: false })
    }
  },
)

watch(
  [editor, () => props.activeSourceAnchor],
  ([currentEditor, anchor]) => {
    if (currentEditor && anchor) {
      locateActiveAnchor()
    } else if (!anchor) {
      feedback.value = null
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function resolveAnchorStatuses(
  anchors: readonly IdentifiedSourceAnchor[],
): Record<string, { status: 'valid' } | { status: 'invalid' } | { status: 'drifted'; startOffset: number; endOffset: number }> | null {
  const currentEditor = editor.value
  if (!currentEditor) {
    return null
  }

  const statuses: Record<
    string,
    { status: 'valid' } | { status: 'invalid' } | { status: 'drifted'; startOffset: number; endOffset: number }
  > = {}
  for (const anchor of anchors) {
    const result = resolveSourceAnchor(currentEditor.state.doc, anchor, hashSourceQuote)
    if (result.status === 'invalid') {
      statuses[anchor.id] = { status: 'invalid' }
    } else if (result.status === 'drifted') {
      statuses[anchor.id] = {
        status: 'drifted',
        startOffset: result.startOffset,
        endOffset: result.endOffset,
      }
    } else {
      statuses[anchor.id] = { status: 'valid' }
    }
  }
  return statuses
}

defineExpose({ resolveAnchorStatuses })
</script>

<template>
  <section class="note-editor" aria-label="原文笔记">
    <header class="note-editor__header">
      <div>
        <p class="note-editor__eyebrow">原文锚定</p>
        <h2>原文笔记</h2>
      </div>
      <div class="note-editor__actions">
        <slot name="actions" />
        <button type="button" :disabled="!canAttachSource" @click="handleCreateAnchor">
          关联选区
        </button>
        <button type="button" :disabled="!activeSourceAnchor" @click="locateActiveAnchor">
          定位锚点
        </button>
      </div>
    </header>

    <div class="note-editor__body">
      <slot name="status" />
      <p
        v-if="feedback"
        class="note-editor__feedback"
        :class="`is-${feedback.tone}`"
        role="status"
      >
        {{ feedback.message }}
      </p>
      <EditorContent v-if="editor" class="note-editor__surface" :editor="editor" />
    </div>
  </section>
</template>

<style scoped>
.note-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  border-right: 1px solid #deddd4;
  background: #fbfaf5;
}

.note-editor__body {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.note-editor__surface {
  min-height: 0;
  flex: 1;
}

.note-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #ebe8de;
}

.note-editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.note-editor__actions :deep(button),
.note-editor__actions button {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid #bfc7bb;
  border-radius: 6px;
  color: #334737;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  background: #ffffff;
}

.note-editor__actions :deep(button.save-note),
.note-editor__actions button.save-note {
  border-color: #38523a;
  color: #ffffff;
  background: #38523a;
}

.note-editor__actions :deep(button:disabled),
.note-editor__actions button:disabled {
  color: #92978f;
  cursor: not-allowed;
  background: #eeeee9;
}

.note-editor__actions :deep(button:hover:not(:disabled)),
.note-editor__actions :deep(button:focus-visible),
.note-editor__actions button:hover:not(:disabled),
.note-editor__actions button:focus-visible {
  border-color: #57735b;
  outline: none;
}

.note-editor__feedback {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid #ebe8de;
  font-size: 12px;
}

.note-editor__feedback.is-success {
  color: #315a3b;
  background: #edf5eb;
}

.note-editor__feedback.is-warning {
  color: #76561e;
  background: #fbf3df;
}

.note-editor__feedback.is-error {
  color: #8a3832;
  background: #fbeceb;
}

.note-editor__eyebrow {
  margin-bottom: 4px;
  color: #687064;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.note-editor__header h2 {
  font-size: 18px;
}

:deep(.note-editor__content) {
  height: 100%;
  min-height: 0;
  padding: 16px 20px;
  overflow: auto;
  outline: none;
}

:deep(.note-editor__content h2) {
  margin-bottom: 16px;
  font-size: 24px;
}

:deep(.note-editor__content p) {
  margin: 12px 0;
  line-height: 1.75;
}
</style>
