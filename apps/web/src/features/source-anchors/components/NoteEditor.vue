<script setup lang="ts">
import { Extension, type JSONContent } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
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

const props = withDefaults(
  defineProps<{
    content: JSONContent
    canAttachSource: boolean
    activeSourceAnchor: IdentifiedSourceAnchor | null
    activeSourceAnchors?: IdentifiedSourceAnchor[]
  }>(),
  { activeSourceAnchors: () => [] },
)

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
const highlightTick = ref(0)

function listActiveAnchors(): IdentifiedSourceAnchor[] {
  if ((props.activeSourceAnchors?.length ?? 0) > 0) {
    return props.activeSourceAnchors
  }
  return props.activeSourceAnchor ? [props.activeSourceAnchor] : []
}

function focusedAnchor(): IdentifiedSourceAnchor | null {
  const anchors = listActiveAnchors()
  const focusedId = props.activeSourceAnchor?.id
  return anchors.find((anchor) => anchor.id === focusedId) ?? anchors[0] ?? null
}

function decorationSetForDoc(doc: ProseMirrorNode): DecorationSet {
  void highlightTick.value
  const decorations: Decoration[] = []
  const focusedId = focusedAnchor()?.id
  for (const anchor of listActiveAnchors()) {
    const result = resolveSourceAnchor(doc, anchor, hashSourceQuote)
    if (result.status === 'invalid') {
      continue
    }
    decorations.push(
      Decoration.inline(result.from, result.to, {
        class:
          anchor.id === focusedId
            ? 'note-editor__anchor-hit is-focused'
            : 'note-editor__anchor-hit',
      }),
    )
  }
  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations)
}

const AnchorHighlight = Extension.create({
  name: 'anchorHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('anchorHighlight'),
        props: {
          decorations: (state) => decorationSetForDoc(state.doc),
        },
      }),
    ]
  },
})

const editor = useEditor({
  content: props.content,
  extensions: [StarterKit, StableBlockId, AnchorHighlight],
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

function locateActiveAnchor(cycle = false) {
  const currentEditor = editor.value
  const anchors = listActiveAnchors()

  if (!currentEditor || anchors.length === 0) {
    feedback.value = { message: '当前节点尚未关联原文。', tone: 'warning' }
    return
  }

  let anchor = focusedAnchor() ?? anchors[0]
  if (!anchor) {
    feedback.value = { message: '当前节点尚未关联原文。', tone: 'warning' }
    return
  }
  const focusedId = anchor.id
  if (cycle && anchors.length > 1) {
    const currentIndex = anchors.findIndex((item) => item.id === focusedId)
    const next = anchors[(currentIndex + 1) % anchors.length]
    if (next) {
      anchor = next
    }
  }

  const result = resolveSourceAnchor(currentEditor.state.doc, anchor, hashSourceQuote)

  if (result.status === 'invalid') {
    feedback.value = { message: invalidAnchorMessages[result.reason], tone: 'error' }
    highlightTick.value += 1
    return
  }

  const transaction = currentEditor.state.tr
    .setSelection(TextSelection.create(currentEditor.state.doc, result.from, result.to))
    .scrollIntoView()

  currentEditor.view.dispatch(transaction)
  currentEditor.view.focus()
  highlightTick.value += 1
  const ordinal = anchors.findIndex((item) => item.id === anchor.id) + 1
  const prefix = anchors.length > 1 ? `第 ${ordinal}/${anchors.length} 处` : '原文'
  feedback.value = {
    message:
      result.status === 'valid'
        ? `已定位${prefix}：“${anchor.quote}”`
        : `原文位置已变化，已按唯一文本重新定位${prefix}：“${anchor.quote}”`,
    tone: result.status === 'valid' ? 'success' : 'warning',
  }
}

function refreshActiveAnchorStatus() {
  const currentEditor = editor.value
  const anchors = listActiveAnchors()

  if (!currentEditor || anchors.length === 0) {
    return
  }

  let invalid = 0
  let drifted = 0
  for (const anchor of anchors) {
    const result = resolveSourceAnchor(currentEditor.state.doc, anchor, hashSourceQuote)
    if (result.status === 'invalid') {
      invalid += 1
    } else if (result.status === 'drifted') {
      drifted += 1
    }
  }

  highlightTick.value += 1

  if (invalid > 0) {
    feedback.value = {
      message: `当前节点有 ${anchors.length} 处原文锚点，其中 ${invalid} 处已失效。`,
      tone: 'error',
    }
  } else if (drifted > 0) {
    feedback.value = {
      message: `当前节点有 ${anchors.length} 处原文锚点，其中 ${drifted} 处位置已变化，可以迁移。`,
      tone: 'warning',
    }
  } else {
    feedback.value = {
      message:
        anchors.length === 1
          ? '当前节点的原文锚点有效。'
          : `当前节点的 ${anchors.length} 处原文锚点均有效。`,
      tone: 'success',
    }
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

const skipAnchorCollapse = ref(false)

function handleEditorPointerDown() {
  skipAnchorCollapse.value = true
}

function collapseLocatedSelection() {
  const currentEditor = editor.value
  if (!currentEditor) {
    return
  }
  const { from, to } = currentEditor.state.selection
  if (from === to) {
    return
  }
  currentEditor.view.dispatch(
    currentEditor.state.tr.setSelection(TextSelection.create(currentEditor.state.doc, from, from)),
  )
}

watch(
  [editor, () => props.activeSourceAnchor, () => listActiveAnchors().map((anchor) => anchor.id).join('|')],
  ([currentEditor, anchor]) => {
    if (currentEditor && listActiveAnchors().length > 0) {
      skipAnchorCollapse.value = false
      locateActiveAnchor(false)
      return
    }
    feedback.value = null
    highlightTick.value += 1
    if (!currentEditor || !anchor) {
      if (skipAnchorCollapse.value) {
        skipAnchorCollapse.value = false
        return
      }
      collapseLocatedSelection()
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
      <div class="note-editor__actions" data-keep-selection>
        <slot name="actions" />
        <button
          type="button"
          data-keep-selection
          :disabled="!canAttachSource"
          @pointerdown.prevent
          @click="handleCreateAnchor"
        >
          关联选区
        </button>
        <button
          type="button"
          data-keep-selection
          :disabled="listActiveAnchors().length === 0"
          @pointerdown.prevent
          @click="locateActiveAnchor(false)"
        >
          定位锚点
        </button>
      </div>
    </header>

    <div v-if="editor" class="note-editor__toolbar" role="toolbar" aria-label="Markdown 格式">
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('bold') }"
        aria-label="加粗"
        @click="editor.chain().focus().toggleBold().run()"
      >
        B
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('italic') }"
        aria-label="斜体"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        I
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('strike') }"
        aria-label="删除线"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        S
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
        aria-label="一级标题"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
      >
        H1
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
        aria-label="二级标题"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }"
        aria-label="三级标题"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('bulletList') }"
        aria-label="无序列表"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        •
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('orderedList') }"
        aria-label="有序列表"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1.
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('blockquote') }"
        aria-label="引用"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        “
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('codeBlock') }"
        aria-label="代码块"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      >
        { }
      </button>
      <button
        type="button"
        aria-label="分割线"
        @click="editor.chain().focus().setHorizontalRule().run()"
      >
        ―
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('code') }"
        aria-label="行内代码"
        @click="editor.chain().focus().toggleCode().run()"
      >
        &lt;/&gt;
      </button>
      <button type="button" aria-label="撤销" @click="editor.chain().focus().undo().run()">
        撤销
      </button>
      <button type="button" aria-label="重做" @click="editor.chain().focus().redo().run()">
        重做
      </button>
    </div>

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
      <EditorContent
        v-if="editor"
        class="note-editor__surface"
        :editor="editor"
        @pointerdown="handleEditorPointerDown"
      />
    </div>
  </section>
</template>

<style scoped>
.note-editor {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  border-right: 1px solid var(--gyre-line);
  background: #ffffff;
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
  border-bottom: 1px solid var(--gyre-line);
}

.note-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--gyre-line);
  background: var(--gyre-surface);
}

.note-editor__toolbar button {
  min-width: 28px;
  min-height: 28px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--gyre-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
}

.note-editor__toolbar button.is-active,
.note-editor__toolbar button:hover,
.note-editor__toolbar button:focus-visible {
  border-color: var(--gyre);
  color: var(--gyre-deep);
  background: var(--gyre-mist);
  outline: none;
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
  border: 1px solid var(--gyre-line);
  border-radius: 6px;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  background: #ffffff;
}

.note-editor__actions :deep(button.save-note),
.note-editor__actions button.save-note {
  border-color: var(--gyre);
  color: #ffffff;
  background: var(--gyre);
}

.note-editor__actions :deep(button:disabled),
.note-editor__actions button:disabled {
  color: var(--gyre-deep);
  cursor: not-allowed;
  background: var(--gyre-mist);
  opacity: 0.7;
}

.note-editor__actions :deep(button:hover:not(:disabled)),
.note-editor__actions :deep(button:focus-visible),
.note-editor__actions button:hover:not(:disabled),
.note-editor__actions button:focus-visible {
  border-color: var(--gyre);
  outline: none;
}

.note-editor__feedback {
  margin: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--gyre-line);
  font-size: 12px;
}

.note-editor__feedback.is-success {
  color: var(--gyre-deep);
  background: var(--gyre-mist);
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
  color: var(--gyre-deep);
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

:deep(.note-editor__anchor-hit) {
  background: rgb(0 160 232 / 14%);
  border-radius: 2px;
}

:deep(.note-editor__anchor-hit.is-focused) {
  background: rgb(0 160 232 / 28%);
  box-shadow: inset 0 -2px 0 var(--gyre);
}
</style>
