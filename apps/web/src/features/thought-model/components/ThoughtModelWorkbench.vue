<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { JSONContent } from '@tiptap/core'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

import BackendHealthStatus from '@/features/health/components/BackendHealthStatus.vue'
import NoteEditor from '@/features/source-anchors/components/NoteEditor.vue'
import type { IdentifiedSourceAnchor, SourceAnchor } from '@/features/source-anchors/domain/source-anchor'
import type { ModelPatchAnchorResolution } from '../domain/model-patch'
import { sampleNoteContent } from '@/features/source-anchors/fixtures/sample-note-content'
import { useNoteAutoSave } from '@/features/notes/composables/use-note-auto-save'
import { listNotes, type NoteSummaryResponse } from '@/features/notes/api/notes-api'
import NoteLibrary from '@/features/notes/components/NoteLibrary.vue'
import { useNotePersistenceStore } from '@/features/notes/stores/note-persistence'

import CandidateGenerationControls from './CandidateGenerationControls.vue'
import CandidateReviewPanel from './CandidateReviewPanel.vue'
import ConfirmedModelViewCaption from './ConfirmedModelViewCaption.vue'
import InstructionChatPanel from './InstructionChatPanel.vue'
import LlmSettingsDialog from './LlmSettingsDialog.vue'
import ModelPatchReviewPanel from './ModelPatchReviewPanel.vue'
import CorrectionToolkit from './CorrectionToolkit.vue'
import ChunkRecallPanel from './ChunkRecallPanel.vue'
import NoteAnswerPanel from './NoteAnswerPanel.vue'
import StructureQueryPanel from './StructureQueryPanel.vue'
import ThoughtEdgeInspector from './ThoughtEdgeInspector.vue'
import ThoughtModelGraph from './ThoughtModelGraph.vue'
import ThoughtNodeInspector from './ThoughtNodeInspector.vue'
import { displayThoughtTypeLabel, createBlankThoughtModel } from '../domain/thought-model'
import { GRAPH_EDGE_PATH_STYLES } from '../adapters/vue-flow'
import { fromPersistedGraphLayout, fromPersistedThoughtModelPayload } from '@/features/notes/domain/note-persistence'
import { sampleThoughtModel } from '../fixtures/sample-thought-model'
import { useThoughtModelWorkbenchStore } from '../stores/workbench'
import { useAuthStore } from '@/features/auth/stores/auth'

type ModelPaneTab = 'candidate' | 'confirmed'
type CandidateToolTab = 'compile' | 'instruction' | 'note-patch'

const blankNoteContent: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { blockId: 'block-start' } }],
}

const workbench = useThoughtModelWorkbenchStore()
const notePersistence = useNotePersistenceStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const {
  model,
  activeView,
  selectedNode,
  selectedEdge,
  selectedSourceAnchors,
  focusedSourceAnchor,
  candidateStatus,
  candidateModel,
  candidateError,
  acceptFeedback,
  nodePositions,
  graphEdgePathStyle,
  pendingInstructionPatch,
  instructionPatchFeedback,
  instructionReviewStatus,
  pendingNoteChangePatch,
  noteChangePatchFeedback,
} = storeToRefs(workbench)
const {
  noteId,
  revision,
  status: saveStatus,
  errorMessage: saveErrorMessage,
  conflictRevision,
  isSaving,
  loadStatus,
  loadErrorMessage,
  indexWarning,
} = storeToRefs(notePersistence)
const noteContent = ref<JSONContent>(blankNoteContent)
const noteSummaries = ref<NoteSummaryResponse[]>([])
const libraryStatus = ref<'idle' | 'loading' | 'error'>('idle')
const libraryError = ref<string | null>(null)
const suppressHomeReset = ref(false)
const libraryCollapsed = ref(false)
const libraryWidth = ref(200)
const noteWidth = ref(440)
const workbenchBodyRef = ref<HTMLElement | null>(null)
const LIBRARY_MIN = 148
const LIBRARY_MAX = 320
const LIBRARY_COLLAPSED = 44
const NOTE_MIN = 280
const GRAPH_MIN = 300
const BRIDGE_WIDTH = 36
const paneGrid = computed(() => {
  const libraryColumn = libraryCollapsed.value ? LIBRARY_COLLAPSED : libraryWidth.value
  return `${libraryColumn}px ${noteWidth.value}px ${BRIDGE_WIDTH}px minmax(0, 1fr)`
})
let stopPaneDrag: (() => void) | null = null

function clampNoteWidth(width: number, bodyWidth: number): number {
  const libraryColumn = libraryCollapsed.value ? LIBRARY_COLLAPSED : libraryWidth.value
  const max = bodyWidth - libraryColumn - BRIDGE_WIDTH - GRAPH_MIN
  return Math.min(Math.max(width, NOTE_MIN), Math.max(NOTE_MIN, max))
}

function startPaneDrag(onMove: (event: PointerEvent) => void) {
  stopPaneDrag?.()
  const move = (event: PointerEvent) => onMove(event)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    stopPaneDrag = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  stopPaneDrag = up
}

function handleResizeLibrary(event: PointerEvent) {
  event.preventDefault()
  const body = workbenchBodyRef.value
  if (!body) {
    return
  }
  const left = body.getBoundingClientRect().left
  startPaneDrag((moveEvent) => {
    libraryWidth.value = Math.min(LIBRARY_MAX, Math.max(LIBRARY_MIN, moveEvent.clientX - left))
    noteWidth.value = clampNoteWidth(noteWidth.value, body.getBoundingClientRect().width)
  })
}

function handleResizeNoteGraph(event: PointerEvent) {
  event.preventDefault()
  const body = workbenchBodyRef.value
  if (!body) {
    return
  }
  const rect = body.getBoundingClientRect()
  startPaneDrag((moveEvent) => {
    const libraryColumn = libraryCollapsed.value ? LIBRARY_COLLAPSED : libraryWidth.value
    noteWidth.value = clampNoteWidth(
      moveEvent.clientX - rect.left - libraryColumn - BRIDGE_WIDTH / 2,
      rect.width,
    )
  })
}

onBeforeUnmount(() => {
  stopPaneDrag?.()
})
const modelPaneTab = ref<ModelPaneTab>('confirmed')
const candidateToolTab = ref<CandidateToolTab>('compile')
const noteEditorRef = ref<{
  resolveAnchorStatuses: (
    anchors: readonly IdentifiedSourceAnchor[],
  ) => Record<string, ModelPatchAnchorResolution> | null
} | null>(null)
const reviewBusy = ref(false)
const llmSettingsOpen = ref(false)
const INSPECTOR_COLLAPSE_KEY = 'gyrnote.collapseInspectorWhenEmpty'
const collapseInspectorWhenEmpty = ref(
  typeof localStorage === 'undefined' || localStorage.getItem(INSPECTOR_COLLAPSE_KEY) !== 'false',
)
const inspectorCollapsed = computed(
  () => collapseInspectorWhenEmpty.value && !selectedNode.value && !selectedEdge.value,
)

const pendingCandidateCount = computed(() => {
  const candidate = candidateModel.value
  if (!candidate) {
    return 0
  }
  const confirmedNodeIds = new Set(model.value.nodes.map((node) => node.id))
  const confirmedEdgeIds = new Set(model.value.edges.map((edge) => edge.id))
  return (
    candidate.nodes.filter((node) => !confirmedNodeIds.has(node.id)).length +
    candidate.edges.filter((edge) => !confirmedEdgeIds.has(edge.id)).length
  )
})

const canApproveCandidateTool = computed(() => {
  if (reviewBusy.value) {
    return false
  }
  if (candidateToolTab.value === 'compile') {
    return pendingCandidateCount.value > 0
  }
  if (candidateToolTab.value === 'instruction') {
    return pendingInstructionPatch.value !== null
  }
  return pendingNoteChangePatch.value !== null
})

const canDismissCandidateTool = computed(() => {
  if (reviewBusy.value) {
    return false
  }
  if (candidateToolTab.value === 'compile') {
    return candidateModel.value !== null
  }
  if (candidateToolTab.value === 'instruction') {
    return pendingInstructionPatch.value !== null
  }
  return pendingNoteChangePatch.value !== null
})

function shouldKeepGraphSelection(target: EventTarget | null): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  if (!element) {
    return false
  }
  return Boolean(
    element.closest('[data-keep-selection]') ||
      element.closest('.vue-flow__node') ||
      element.closest('.vue-flow__edge') ||
      element.closest('.vue-flow__edge-path') ||
      element.closest('.wb-modal'),
  )
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (shouldKeepGraphSelection(event.target)) {
    return
  }
  workbench.clearSelection()
}

watch(collapseInspectorWhenEmpty, (value) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(INSPECTOR_COLLAPSE_KEY, value ? 'true' : 'false')
  }
})

async function persistNote(): Promise<void> {
  await notePersistence.save({
    title: model.value.title,
    contentJson: noteContent.value,
    sourceAnchors: workbench.sourceAnchors,
    thoughtModel: model.value,
    graphLayout: {
      nodePositions: nodePositions.value,
      edgePathStyle: graphEdgePathStyle.value,
    },
    expectedRevision: revision.value ?? 1,
  })
  if (noteId.value) {
    workbench.syncModelNoteIdentity(noteId.value, model.value.title)
    await router.replace({ name: 'note', params: { noteId: noteId.value } })
    await refreshNoteLibrary()
  }
}

const autoSave = useNoteAutoSave(persistNote)

function markConfirmedModelDirty() {
  notePersistence.markDirty()
  autoSave.schedule()
}

function getNodeText(nodeId: string): string {
  return model.value.nodes.find((node) => node.id === nodeId)?.text ?? nodeId
}

function handleCreateSourceAnchor(anchor: SourceAnchor) {
  workbench.attachSourceAnchorToSelectedNode(anchor)
  notePersistence.markDirty()
  autoSave.schedule()
}

function handleLocateSourceAnchor(anchorId: string) {
  workbench.focusSourceAnchor(anchorId)
}

function handleNoteContentUpdate(content: JSONContent) {
  noteContent.value = content
  notePersistence.markDirty()
  autoSave.schedule()
}

async function handleSaveNote() {
  await autoSave.saveNow()
}

async function loadNoteFromRoute(routeNoteId: string | undefined, force = false) {
  if (!force && routeNoteId && routeNoteId === noteId.value) {
    return
  }

  autoSave.cancel()

  if (!routeNoteId) {
    if (suppressHomeReset.value) {
      suppressHomeReset.value = false
      return
    }
    notePersistence.reset()
    workbench.replaceSourceAnchors([])
    workbench.replaceConfirmedModel(createBlankThoughtModel())
    noteContent.value = structuredClone(blankNoteContent)
    return
  }

  try {
    const note = await notePersistence.load(routeNoteId)
    noteContent.value = note.content_json
    workbench.replaceSourceAnchors(
      note.source_anchors.map((anchor) => ({
        id: anchor.id,
        blockId: anchor.block_id,
        startOffset: anchor.start_offset,
        endOffset: anchor.end_offset,
        quote: anchor.quote,
        quoteHash: anchor.quote_hash,
      })),
    )
    workbench.replaceConfirmedModel(fromPersistedThoughtModelPayload(note.thought_model))
    workbench.replaceGraphLayout(fromPersistedGraphLayout(note.graph_layout))
  } catch {
    // The persistence store exposes the actionable loading error to the template.
  }
}

async function handleReloadLatestNote() {
  if (noteId.value) {
    await loadNoteFromRoute(noteId.value, true)
  }
}

watch(
  () => route.params.noteId,
  (routeNoteId) => {
    void loadNoteFromRoute(typeof routeNoteId === 'string' ? routeNoteId : undefined)
  },
  { immediate: true },
)

watch(candidateStatus, (status) => {
  if (status === 'ready') {
    modelPaneTab.value = 'candidate'
    candidateToolTab.value = 'compile'
  }
})

async function refreshNoteLibrary() {
  libraryStatus.value = 'loading'
  libraryError.value = null
  try {
    noteSummaries.value = await listNotes()
    libraryStatus.value = 'idle'
  } catch (error) {
    libraryStatus.value = 'error'
    libraryError.value = error instanceof Error ? error.message : '无法加载笔记目录'
  }
}

function confirmLeaveDirty(): boolean {
  if (saveStatus.value !== 'dirty' || (!noteId.value && model.value.nodes.length === 0)) {
    return true
  }
  return window.confirm('当前笔记尚未保存，确定离开？')
}

async function handleOpenLibraryNote(targetNoteId: string) {
  if (targetNoteId === noteId.value) {
    return
  }
  if (!confirmLeaveDirty()) {
    return
  }
  await router.push({ name: 'note', params: { noteId: targetNoteId } })
}

async function handleCreateBlankNote() {
  if (!confirmLeaveDirty()) {
    return
  }
  notePersistence.reset()
  workbench.replaceSourceAnchors([])
  workbench.replaceConfirmedModel(createBlankThoughtModel())
  noteContent.value = structuredClone(blankNoteContent)
  if (route.name !== 'home') {
    await router.push({ name: 'home' })
  }
}

function handleStartFromExample() {
  if (!confirmLeaveDirty()) {
    return
  }
  notePersistence.reset()
  workbench.replaceSourceAnchors([])
  workbench.replaceConfirmedModel(structuredClone(sampleThoughtModel))
  noteContent.value = structuredClone(sampleNoteContent)
  if (route.name !== 'home') {
    suppressHomeReset.value = true
    void router.replace({ name: 'home' })
  }
}

onMounted(() => {
  void refreshNoteLibrary()
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
})

onBeforeUnmount(() => {
  stopPaneDrag?.()
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
})

async function handleSignOut() {
  await auth.signOut()
  await router.replace({ name: 'login' })
}

async function handleGenerateCandidate() {
  if (!noteId.value || revision.value === null) {
    return
  }

  try {
    await workbench.generateCandidateFromApi(
      noteId.value,
      revision.value,
      model.value.title,
      noteContent.value,
    )
  } catch {
    // candidateStatus / candidateError already expose the actionable failure.
  } finally {
    markConfirmedModelDirty()
  }
}

function handleAcceptCandidateNode(candidateNodeId: string) {
  const result = workbench.acceptCandidateNode(candidateNodeId)
  if (result.ok) {
    markConfirmedModelDirty()
  }
}

function handleAcceptCandidateEdge(candidateEdgeId: string) {
  const result = workbench.acceptCandidateEdge(candidateEdgeId)
  if (result.ok) {
    markConfirmedModelDirty()
  }
}

function handleAcceptAllCandidates() {
  const result = workbench.acceptAllCandidates()
  if (result.ok) {
    markConfirmedModelDirty()
  }
}

function handleApproveCandidateTool() {
  if (candidateToolTab.value === 'compile') {
    handleAcceptAllCandidates()
    return
  }
  if (candidateToolTab.value === 'instruction') {
    void handleApproveInstructionPatch()
    return
  }
  if (workbench.acceptRemainingNoteChangeOps()) {
    markConfirmedModelDirty()
  }
}

function handleDismissCandidateTool() {
  if (candidateToolTab.value === 'compile') {
    workbench.discardCandidate()
    return
  }
  if (candidateToolTab.value === 'instruction') {
    void handleDismissInstructionPatch()
    return
  }
  workbench.dismissNoteChangePatch()
}

function handleTitleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  workbench.renameTitle(value)
  markConfirmedModelDirty()
}

function handleTitleBlur() {
  if (!model.value.title.trim()) {
    workbench.renameTitle('未命名笔记')
    markConfirmedModelDirty()
  }
}

function handleCreateConfirmedNode(
  ...args: Parameters<typeof workbench.createConfirmedNode>
) {
  if (workbench.createConfirmedNode(...args)) {
    markConfirmedModelDirty()
  }
}

function handleCreateConfirmedEdge(
  ...args: Parameters<typeof workbench.createConfirmedEdge>
) {
  if (workbench.createConfirmedEdge(...args)) {
    markConfirmedModelDirty()
  }
}

function handleConnectNodes(payload: { sourceNodeId: string; targetNodeId: string }) {
  if (workbench.connectNodesOnGraph(payload.sourceNodeId, payload.targetNodeId)) {
    markConfirmedModelDirty()
  }
}

function handleMoveNode(payload: { nodeId: string; position: { x: number; y: number } }) {
  if (workbench.setNodePosition(payload.nodeId, payload.position)) {
    markConfirmedModelDirty()
  }
}

function handleGraphEdgePathStyleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value as (typeof GRAPH_EDGE_PATH_STYLES)[number]
  if (workbench.setGraphEdgePathStyle(value)) {
    markConfirmedModelDirty()
  }
}

function handleResetGraphLayout() {
  workbench.resetGraphLayout()
  markConfirmedModelDirty()
}

async function handleOpenStructureHit(targetNoteId: string) {
  if (typeof route.params.noteId === 'string' && route.params.noteId === targetNoteId) {
    return
  }
  await router.push({ name: 'note', params: { noteId: targetNoteId } })
}

async function handleProposePatchFromNote() {
  const statuses = noteEditorRef.value?.resolveAnchorStatuses(workbench.sourceAnchors) ?? null
  if (!workbench.loadPatchFromAnchorStatuses(statuses)) {
    return
  }
  modelPaneTab.value = 'candidate'
  candidateToolTab.value = 'note-patch'
}

async function handleCompileFromInstruction(instruction: string) {
  modelPaneTab.value = 'candidate'
  candidateToolTab.value = 'instruction'
  reviewBusy.value = true
  try {
    await workbench.compileInstructionPatchFromInstruction(instruction)
  } finally {
    reviewBusy.value = false
  }
}

async function handleApproveInstructionPatch() {
  reviewBusy.value = true
  try {
    if (await workbench.approvePendingPatchViaReview()) {
      markConfirmedModelDirty()
    }
  } finally {
    reviewBusy.value = false
  }
}

async function handleDismissInstructionPatch() {
  reviewBusy.value = true
  try {
    await workbench.rejectPendingPatchViaReview()
  } finally {
    reviewBusy.value = false
  }
}

function handleAcceptNoteChangeOp(index: number) {
  if (workbench.acceptNoteChangeOp(index)) {
    markConfirmedModelDirty()
  }
}

function handleUpdateSelectedNodeText(text: string) {
  if (workbench.updateSelectedNodeText(text)) {
    markConfirmedModelDirty()
  }
}

function handleUpdateSelectedEdgeType(type: Parameters<typeof workbench.updateSelectedEdgeType>[0]) {
  if (workbench.updateSelectedEdgeType(type)) {
    markConfirmedModelDirty()
  }
}

function handleLockSelectedNode() {
  if (workbench.lockSelectedNode()) {
    markConfirmedModelDirty()
  }
}

function handleUnlockSelectedNode() {
  if (workbench.unlockSelectedNode()) {
    markConfirmedModelDirty()
  }
}

function handleDeleteSelectedNode() {
  if (workbench.deleteSelectedNode()) {
    markConfirmedModelDirty()
  }
}

function handleDeleteSelectedEdge() {
  if (workbench.deleteSelectedEdge()) {
    markConfirmedModelDirty()
  }
}
</script>

<template>
  <main class="workbench">
    <header class="workbench__header">
      <div class="workbench__brand">
        <img class="workbench__mark" src="/icon.png" width="36" height="36" alt="" />
        <div>
          <p class="eyebrow">Gyrnote</p>
          <h1>
            <input
              class="workbench__title-input"
              :value="model.title"
              maxlength="200"
              aria-label="笔记标题"
              @input="handleTitleInput"
              @blur="handleTitleBlur"
            />
          </h1>
          <p class="summary">
            确认 {{ model.nodes.length }} 节点 · {{ model.edges.length }} 关系 ·
            {{ noteId ? `r${revision}` : '未保存' }}
          </p>
        </div>
      </div>

      <div class="workbench__utilities" aria-label="次要工具">
        <button class="sign-out" type="button" @click="llmSettingsOpen = true">模型密钥</button>
        <BackendHealthStatus compact />
        <button class="sign-out" type="button" @click="handleSignOut">退出</button>
      </div>
    </header>

    <section ref="workbenchBodyRef" class="workbench__body" :style="{ gridTemplateColumns: paneGrid }">
      <NoteLibrary
        :notes="noteSummaries"
        :current-note-id="noteId"
        :loading="libraryStatus === 'loading'"
        :error-message="libraryError"
        :collapsed="libraryCollapsed"
        @open="handleOpenLibraryNote"
        @create="handleCreateBlankNote"
        @start-example="handleStartFromExample"
        @toggle-collapse="libraryCollapsed = !libraryCollapsed"
        @resize-library="handleResizeLibrary"
      />

      <NoteEditor
        ref="noteEditorRef"
        :content="noteContent"
        :can-attach-source="Boolean(selectedNode)"
        :active-source-anchor="focusedSourceAnchor"
        :active-source-anchors="selectedSourceAnchors"
        @update="handleNoteContentUpdate"
        @create-anchor="handleCreateSourceAnchor"
      >
        <template #actions>
          <button
            class="save-note"
            :disabled="isSaving || !auth.isAuthenticated"
            type="button"
            @click="
              saveStatus === 'error' && conflictRevision !== null
                ? handleReloadLatestNote()
                : handleSaveNote()
            "
          >
            {{
              isSaving
                ? '保存中…'
                : conflictRevision !== null
                  ? '加载最新'
                  : saveStatus === 'error'
                    ? '重试保存'
                    : '保存笔记'
            }}
          </button>
        </template>
        <template #status>
          <p v-if="autoSave.isPending" class="save-feedback" role="status">
            停止输入约 8 秒后保存（每次保存会新增一版）
          </p>
          <p
            v-else-if="saveStatus === 'saved'"
            class="save-feedback save-feedback--success"
            role="status"
          >
            {{ indexWarning ?? '已保存' }}
          </p>
          <p
            v-else-if="saveStatus === 'error'"
            class="save-feedback save-feedback--error"
            role="alert"
          >
            {{ saveErrorMessage }}
          </p>
          <p v-if="loadStatus === 'loading'" class="save-feedback" role="status">加载笔记…</p>
          <p
            v-else-if="loadStatus === 'error'"
            class="save-feedback save-feedback--error"
            role="alert"
          >
            {{ loadErrorMessage }}
          </p>
        </template>
      </NoteEditor>

      <aside class="workbench__bridge" aria-label="笔记到模型的编译桥接">
        <button
          class="pane-handle pane-handle--note-graph"
          type="button"
          aria-label="调整笔记与图宽度"
          @pointerdown="handleResizeNoteGraph"
        />
        <CandidateGenerationControls
          compact
          :note-id="noteId"
          :revision="revision"
          :status="candidateStatus"
          :error-message="candidateError"
          :candidate-node-count="candidateModel?.nodes.length ?? 0"
          @generate="handleGenerateCandidate"
        />
      </aside>

      <div class="model-pane">
        <div class="model-pane__tabs" role="tablist" aria-label="模型区域">
          <button
            type="button"
            role="tab"
            :aria-selected="modelPaneTab === 'candidate'"
            :class="{ 'is-active': modelPaneTab === 'candidate' }"
            @click="modelPaneTab = 'candidate'"
          >
            候选模型
            <span v-if="candidateModel" class="model-pane__badge">
              {{ candidateModel.nodes.length + candidateModel.edges.length }}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="modelPaneTab === 'confirmed'"
            :class="{ 'is-active': modelPaneTab === 'confirmed' }"
            @click="modelPaneTab = 'confirmed'"
          >
            确认模型
          </button>
        </div>

        <div v-show="modelPaneTab === 'candidate'" class="model-pane__panel" role="tabpanel">
          <div class="model-pane__tabs model-pane__tabs--sub" role="tablist" aria-label="候选模型工具">
            <button
              type="button"
              role="tab"
              :aria-selected="candidateToolTab === 'compile'"
              :class="{ 'is-active': candidateToolTab === 'compile' }"
              @click="candidateToolTab = 'compile'"
            >
              全局编译
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="candidateToolTab === 'instruction'"
              :class="{ 'is-active': candidateToolTab === 'instruction' }"
              @click="candidateToolTab = 'instruction'"
            >
              自然语言改图
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="candidateToolTab === 'note-patch'"
              :class="{ 'is-active': candidateToolTab === 'note-patch' }"
              @click="candidateToolTab = 'note-patch'"
            >
              原文变更
            </button>
          </div>
          <div class="candidate-tool-bar" aria-label="候选操作">
            <button
              type="button"
              class="candidate-tool-bar__apply"
              :disabled="!canApproveCandidateTool"
              @click="handleApproveCandidateTool"
            >
              批准应用
            </button>
            <button
              type="button"
              class="candidate-tool-bar__dismiss"
              :disabled="!canDismissCandidateTool"
              @click="handleDismissCandidateTool"
            >
              丢弃
            </button>
          </div>

          <CandidateReviewPanel
            v-show="candidateToolTab === 'compile'"
            :candidate="candidateModel"
            :confirmed-node-ids="model.nodes.map((node) => node.id)"
            :confirmed-edge-ids="model.edges.map((edge) => edge.id)"
            :accept-feedback="acceptFeedback"
            @accept-node="handleAcceptCandidateNode"
            @accept-edge="handleAcceptCandidateEdge"
          />
          <InstructionChatPanel
            v-show="candidateToolTab === 'instruction'"
            :feedback="instructionPatchFeedback"
            :review-busy="reviewBusy"
            :patch="pendingInstructionPatch"
            :review-status="instructionReviewStatus"
            @send="handleCompileFromInstruction"
          />
          <ModelPatchReviewPanel
            v-show="candidateToolTab === 'note-patch'"
            :patch="pendingNoteChangePatch"
            :feedback="noteChangePatchFeedback"
            :review-busy="reviewBusy"
            @propose-from-note="handleProposePatchFromNote"
            @accept-op="handleAcceptNoteChangeOp"
          />
        </div>

        <div
          v-show="modelPaneTab === 'confirmed'"
          class="model-pane__panel model-pane__panel--confirmed"
          role="tabpanel"
        >
          <div class="model-pane__confirmed-toolbar">
            <ConfirmedModelViewCaption
              :has-candidate="
                Boolean(
                  candidateModel &&
                    (candidateModel.nodes.length > 0 || candidateModel.edges.length > 0),
                )
              "
            />
            <div class="model-pane__graph-tools" aria-label="图视图工具">
              <label class="edge-style">
                边样式
                <select
                  :value="graphEdgePathStyle"
                  @change="handleGraphEdgePathStyleChange"
                >
                  <option value="default">曲线</option>
                  <option value="smoothstep">折线</option>
                  <option value="straight">直线</option>
                </select>
              </label>
              <button type="button" class="layout-reset" @click="handleResetGraphLayout">
                重置布局
              </button>
              <div class="view-switcher" aria-label="思维模型视图">
                <button
                  :class="{ 'is-active': activeView === 'graph' }"
                  type="button"
                  @click="workbench.selectView('graph')"
                >
                  图
                </button>
                <button
                  :class="{ 'is-active': activeView === 'outline' }"
                  type="button"
                  @click="workbench.selectView('outline')"
                >
                  大纲
                </button>
              </div>
            </div>
          </div>

          <div class="model-pane__tools">
            <StructureQueryPanel @open-note="handleOpenStructureHit" />
            <ChunkRecallPanel :note-id="noteId" @open-note="handleOpenStructureHit" />
            <NoteAnswerPanel :note-id="noteId" @open-note="handleOpenStructureHit" />
            <CorrectionToolkit
              :nodes="model.nodes"
              @create-node="handleCreateConfirmedNode"
              @create-edge="handleCreateConfirmedEdge"
            />
          </div>

          <ThoughtModelGraph
            v-if="activeView === 'graph'"
            :model="model"
            :node-positions="nodePositions"
            :edge-path-style="graphEdgePathStyle"
            @select-node="workbench.selectNode"
            @select-edge="workbench.selectEdge"
            @move-node="handleMoveNode"
            @connect-nodes="handleConnectNodes"
          />

          <div v-else class="outline-view">
            <section>
              <h2>确认模型节点</h2>
              <ol class="outline" aria-label="思维模型节点">
                <li v-for="node in model.nodes" :key="node.id">
                  <button type="button" data-keep-selection @click="workbench.selectNode(node.id)">
                    <span class="node-type">{{ displayThoughtTypeLabel(node.type, node.label) }}</span>
                    <span>{{ node.text }}</span>
                  </button>
                </li>
              </ol>
            </section>

            <section>
              <h2>确认模型关系</h2>
              <ol class="relation-list" aria-label="思维模型关系">
                <li v-for="edge in model.edges" :key="edge.id">
                  <button type="button" data-keep-selection @click="workbench.selectEdge(edge.id)">
                    <span>{{ getNodeText(edge.sourceNodeId) }}</span>
                    <span class="relation-type">{{
                      displayThoughtTypeLabel(edge.type, edge.label)
                    }}</span>
                    <span>{{ getNodeText(edge.targetNodeId) }}</span>
                  </button>
                </li>
              </ol>
            </section>
          </div>
        </div>
      </div>

      <section
        class="workbench__inspector"
        data-keep-selection
        :class="{ 'is-collapsed': inspectorCollapsed }"
        aria-label="节点与关系详情"
      >
        <label class="inspector-collapse-opt">
          <input v-model="collapseInspectorWhenEmpty" type="checkbox" />
          未选中时收起详情
        </label>
        <template v-if="!inspectorCollapsed">
          <ThoughtEdgeInspector
            v-if="selectedEdge"
            :edge="selectedEdge"
            :source-text="getNodeText(selectedEdge.sourceNodeId)"
            :target-text="getNodeText(selectedEdge.targetNodeId)"
            @save="handleUpdateSelectedEdgeType"
            @delete="handleDeleteSelectedEdge"
          />
          <ThoughtNodeInspector
            v-else
            :node="selectedNode"
            :source-anchors="selectedSourceAnchors"
            :focused-source-anchor-id="focusedSourceAnchor?.id ?? null"
            @save="handleUpdateSelectedNodeText"
            @lock="handleLockSelectedNode"
            @unlock="handleUnlockSelectedNode"
            @delete="handleDeleteSelectedNode"
            @locate-anchor="handleLocateSourceAnchor"
          />
        </template>
        <p v-else class="inspector-collapse-hint">点选图上的节点或关系后再展开编辑。</p>
      </section>
    </section>
    <LlmSettingsDialog :open="llmSettingsOpen" @close="llmSettingsOpen = false" />
  </main>
</template>

<style scoped>
.workbench {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  padding: 10px 16px 12px;
  color: var(--gyre-ink);
  background: var(--gyre-mist);
}

.workbench__header,
.workbench__body {
  width: min(1440px, 100%);
  margin: 0 auto;
}

.workbench__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.workbench__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.workbench__mark {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.eyebrow,
.summary {
  color: var(--gyre-deep);
}

.eyebrow {
  margin-bottom: 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(18px, 2vw, 24px);
  font-weight: 650;
  letter-spacing: -0.03em;
}

.workbench__title-input {
  width: min(480px, 100%);
  margin: 0;
  padding: 0;
  border: 0;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  background: transparent;
}

.workbench__title-input:focus-visible {
  outline: 2px solid rgb(0 160 232 / 35%);
  border-radius: 6px;
}

.summary {
  margin: 2px 0 0;
  font-size: 12px;
}

.workbench__utilities {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
}

.sign-out {
  padding: 5px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 7px;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 12px;
  background: #ffffff;
  cursor: pointer;
}

.save-feedback {
  margin: 0;
  padding: 6px 16px;
  border-bottom: 1px solid var(--gyre-line);
  color: var(--gyre-deep);
  font-size: 12px;
}

.save-feedback--success {
  color: var(--gyre-deep);
  background: var(--gyre-mist);
}

.save-feedback--error {
  color: #a23d35;
  background: #fbeceb;
}

.workbench__body {
  display: grid;
  flex: 1;
  grid-template-columns: 200px minmax(0, 1fr) 36px minmax(0, 1.05fr);
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--gyre-line);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 14px 40px rgb(12 58 82 / 10%);
}

.workbench__body > :nth-child(2) {
  min-height: 0;
  overflow: hidden;
}

.workbench__bridge {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 0;
  border-left: 1px solid var(--gyre-line);
  border-right: 1px solid var(--gyre-line);
  background:
    linear-gradient(180deg, rgb(0 160 232 / 10%), transparent 42%, rgb(152 216 232 / 28%)),
    var(--gyre-surface);
}

.pane-handle--note-graph {
  position: absolute;
  z-index: 3;
  top: 0;
  left: -4px;
  width: 8px;
  height: 100%;
  padding: 0;
  border: 0;
  cursor: col-resize;
  background: transparent;
}

.pane-handle--note-graph:hover,
.pane-handle--note-graph:focus-visible {
  background: rgb(0 160 232 / 18%);
}

.workbench__body > :last-child {
  grid-column: 1 / -1;
  min-height: 0;
  max-height: 30vh;
  overflow: auto;
}

.workbench__inspector.is-collapsed {
  max-height: none;
}

.inspector-collapse-opt,
.inspector-collapse-hint {
  margin: 0;
  padding: 8px 16px;
  color: var(--gyre-deep);
  font-size: 12px;
}

.inspector-collapse-opt {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workbench__inspector :deep(.inspector),
.workbench__inspector :deep(.edge-inspector) {
  width: 100%;
  max-width: none;
}

.model-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.model-pane__tabs {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 8px 10px 0;
  background: var(--gyre-surface);
}

.model-pane__tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px 10px 0 0;
  color: var(--gyre-deep);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
}

.model-pane__tabs button.is-active {
  color: var(--gyre-ink);
  font-weight: 700;
  background: #ffffff;
  box-shadow: inset 0 1px 0 #ffffff;
}

.model-pane__tabs--sub {
  flex-wrap: wrap;
  padding: 6px 10px 8px;
  border-bottom: 1px solid var(--gyre-line);
}

.model-pane__tabs--sub button {
  border-radius: 8px;
}

.model-pane__tabs--sub button.is-active {
  box-shadow: none;
  background: var(--gyre-mist);
}

.candidate-tool-bar {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 16px 0;
  background: var(--gyre-mist);
}

.candidate-tool-bar button {
  padding: 7px 12px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  background: #ffffff;
}

.candidate-tool-bar__apply:not(:disabled) {
  border-color: var(--gyre);
  background: var(--gyre-mist);
}

.candidate-tool-bar button:disabled {
  color: #8b9088;
  cursor: not-allowed;
  background: #e2e3de;
}

.model-pane__badge {
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--gyre-deep);
  font-size: 11px;
  font-weight: 700;
  background: var(--gyre-mist);
}

.model-pane__panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: auto;
  background: #ffffff;
}

.model-pane__panel--confirmed {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.model-pane__tools {
  position: absolute;
  z-index: 4;
  top: 52px;
  left: 10px;
  display: flex;
  max-width: min(440px, calc(100% - 20px));
  max-height: min(48%, 340px);
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6px;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--gyre-line);
  border-radius: 14px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 10px 28px rgb(12 58 82 / 12%);
}

.model-pane__tools :deep(.structure-query),
.model-pane__tools :deep(.chunk-recall),
.model-pane__tools :deep(.note-answer),
.model-pane__tools :deep(.correction-toolkit) {
  flex: 0 0 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border-bottom: 0;
  background: transparent;
}

.model-pane__confirmed-toolbar {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid var(--gyre-line);
}

.model-pane__confirmed-toolbar :deep(.confirmed-caption) {
  border-bottom: 0;
}

.model-pane__graph-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-right: 10px;
}

.edge-style {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--gyre-deep);
  font-size: 12px;
}

.edge-style select,
.layout-reset {
  padding: 5px 8px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  font-size: 12px;
  background: #ffffff;
}

.layout-reset {
  cursor: pointer;
}

.view-switcher {
  display: flex;
  padding: 3px;
  border: 1px solid var(--gyre-line);
  border-radius: 10px;
  background: var(--gyre-mist);
}

.view-switcher button,
.outline button,
.relation-list button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.view-switcher button {
  padding: 5px 10px;
  border-radius: 7px;
  color: var(--gyre-deep);
  font-size: 12px;
  background: transparent;
}

.view-switcher button.is-active {
  color: var(--gyre-ink);
  background: #ffffff;
  box-shadow: 0 1px 3px rgb(12 58 82 / 12%);
}

.outline-view {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: auto;
}

.outline-view section + section {
  margin-top: 22px;
}

.outline-view h2 {
  margin-bottom: 10px;
  font-size: 15px;
}

.outline,
.relation-list {
  display: grid;
  align-content: start;
  gap: 10px;
  list-style: none;
}

.outline button,
.relation-list button {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--gyre-line);
  border-radius: 12px;
  color: inherit;
  text-align: left;
  background: #ffffff;
}

.outline button:hover,
.outline button:focus-visible,
.relation-list button:hover,
.relation-list button:focus-visible {
  border-color: var(--gyre);
  outline: none;
}

.relation-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  font-size: 13px;
}

.relation-list button > :first-child {
  text-align: right;
}

.relation-list button > :last-child {
  text-align: left;
}

.relation-type {
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--gyre-deep);
  font-size: 11px;
  font-weight: 700;
  background: var(--gyre-mist);
}

.node-type {
  display: inline-flex;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--gyre-deep);
  font-size: 12px;
  font-weight: 700;
  background: var(--gyre-mist);
}

.model-pane :deep(.candidate-review) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-bottom: 0;
}

@media (max-width: 760px) {
  /* 手机端完整改版后置（卡片式）；当前仅避免完全锁死滚动 */
  .workbench {
    height: auto;
    max-height: none;
    overflow: auto;
    padding: 12px;
  }

  .workbench__header {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench__body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, auto) auto minmax(280px, auto) minmax(160px, auto);
  }

  .workbench__bridge {
    border-right: 0;
    border-bottom: 1px solid var(--gyre-line);
  }

  .pane-handle--note-graph {
    display: none;
  }

  .workbench__body > :last-child {
    max-height: none;
  }
}
</style>
