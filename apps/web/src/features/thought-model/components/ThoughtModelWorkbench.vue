<script setup lang="ts">
import { ref, watch } from 'vue'
import type { JSONContent } from '@tiptap/core'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

import BackendHealthStatus from '@/features/health/components/BackendHealthStatus.vue'
import NoteEditor from '@/features/source-anchors/components/NoteEditor.vue'
import type { IdentifiedSourceAnchor, SourceAnchor } from '@/features/source-anchors/domain/source-anchor'
import type { ModelPatchAnchorResolution } from '../domain/model-patch'
import { sampleNoteContent } from '@/features/source-anchors/fixtures/sample-note-content'
import { useNoteAutoSave } from '@/features/notes/composables/use-note-auto-save'
import { useNotePersistenceStore } from '@/features/notes/stores/note-persistence'

import CandidateGenerationControls from './CandidateGenerationControls.vue'
import CandidateReviewPanel from './CandidateReviewPanel.vue'
import ConfirmedModelViewCaption from './ConfirmedModelViewCaption.vue'
import ModelPatchReviewPanel from './ModelPatchReviewPanel.vue'
import CorrectionToolkit from './CorrectionToolkit.vue'
import ChunkRecallPanel from './ChunkRecallPanel.vue'
import StructureQueryPanel from './StructureQueryPanel.vue'
import ThoughtEdgeInspector from './ThoughtEdgeInspector.vue'
import ThoughtModelGraph from './ThoughtModelGraph.vue'
import ThoughtNodeInspector from './ThoughtNodeInspector.vue'
import { displayThoughtTypeLabel } from '../domain/thought-model'
import { GRAPH_EDGE_PATH_STYLES } from '../adapters/vue-flow'
import { fromPersistedGraphLayout, fromPersistedThoughtModelPayload } from '@/features/notes/domain/note-persistence'
import { sampleThoughtModel } from '../fixtures/sample-thought-model'
import { useThoughtModelWorkbenchStore } from '../stores/workbench'
import { useAuthStore } from '@/features/auth/stores/auth'

type ModelPaneTab = 'candidate' | 'confirmed'

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
  selectedSourceAnchor,
  candidateStatus,
  candidateModel,
  candidateError,
  acceptFeedback,
  nodePositions,
  graphEdgePathStyle,
  pendingPatch,
  patchFeedback,
  patchReviewStatus,
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
} = storeToRefs(notePersistence)
const noteContent = ref<JSONContent>(sampleNoteContent)
const modelPaneTab = ref<ModelPaneTab>('confirmed')
const noteEditorRef = ref<{
  resolveAnchorStatuses: (
    anchors: readonly IdentifiedSourceAnchor[],
  ) => Record<string, ModelPatchAnchorResolution> | null
} | null>(null)
const reviewBusy = ref(false)

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
    notePersistence.reset()
    workbench.replaceSourceAnchors([])
    workbench.replaceConfirmedModel(structuredClone(sampleThoughtModel))
    noteContent.value = structuredClone(sampleNoteContent)
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
  }
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

async function handleLoadFixtureModelPatch() {
  if (!workbench.loadFixtureModelPatch()) {
    return
  }
  reviewBusy.value = true
  try {
    await workbench.startPendingPatchReview()
  } finally {
    reviewBusy.value = false
  }
}

async function handleProposePatchFromNote() {
  const statuses = noteEditorRef.value?.resolveAnchorStatuses(workbench.sourceAnchors) ?? null
  if (!workbench.loadPatchFromAnchorStatuses(statuses)) {
    return
  }
  reviewBusy.value = true
  try {
    await workbench.startPendingPatchReview()
  } finally {
    reviewBusy.value = false
  }
}

async function handleCompileFromInstruction(instruction: string) {
  reviewBusy.value = true
  try {
    if (!(await workbench.compileInstructionPatchFromInstruction(instruction))) {
      return
    }
    await workbench.startPendingPatchReview()
  } finally {
    reviewBusy.value = false
  }
}

async function handleApplyPendingPatch() {
  reviewBusy.value = true
  try {
    if (await workbench.approvePendingPatchViaReview()) {
      markConfirmedModelDirty()
    }
  } finally {
    reviewBusy.value = false
  }
}

async function handleDismissPendingPatch() {
  reviewBusy.value = true
  try {
    await workbench.rejectPendingPatchViaReview()
  } finally {
    reviewBusy.value = false
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
        <p class="eyebrow">Gyrnote</p>
        <h1>{{ model.title }}</h1>
        <p class="summary">
          确认 {{ model.nodes.length }} 节点 · {{ model.edges.length }} 关系 ·
          {{ noteId ? `r${revision}` : '未保存' }}
        </p>
      </div>

      <div class="workbench__utilities" aria-label="次要工具">
        <BackendHealthStatus compact />
        <button class="sign-out" type="button" @click="handleSignOut">退出</button>
      </div>
    </header>

    <section class="workbench__body">
      <NoteEditor
        ref="noteEditorRef"
        :content="noteContent"
        :can-attach-source="Boolean(selectedNode)"
        :active-source-anchor="selectedSourceAnchor"
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
          <p v-if="autoSave.isPending" class="save-feedback" role="status">将自动保存</p>
          <p
            v-else-if="saveStatus === 'saved'"
            class="save-feedback save-feedback--success"
            role="status"
          >
            已保存
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
          <CandidateReviewPanel
            :candidate="candidateModel"
            :confirmed-node-ids="model.nodes.map((node) => node.id)"
            :confirmed-edge-ids="model.edges.map((edge) => edge.id)"
            :accept-feedback="acceptFeedback"
            @accept-node="handleAcceptCandidateNode"
            @accept-edge="handleAcceptCandidateEdge"
          />
          <ModelPatchReviewPanel
            :patch="pendingPatch"
            :feedback="patchFeedback"
            :review-status="patchReviewStatus"
            :review-busy="reviewBusy"
            @load-fixture="handleLoadFixtureModelPatch"
            @propose-from-note="handleProposePatchFromNote"
            @compile-from-instruction="handleCompileFromInstruction"
            @apply="handleApplyPendingPatch"
            @dismiss="handleDismissPendingPatch"
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
                  <button type="button" @click="workbench.selectNode(node.id)">
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
                  <button type="button" @click="workbench.selectEdge(edge.id)">
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
        :source-anchor="selectedSourceAnchor"
        @save="handleUpdateSelectedNodeText"
        @lock="handleLockSelectedNode"
        @unlock="handleUnlockSelectedNode"
        @delete="handleDeleteSelectedNode"
      />
    </section>
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
  color: #20251f;
  background: #f3f0e8;
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
  min-width: 0;
}

.eyebrow,
.summary {
  color: #687064;
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
  border: 1px solid #c7c9bd;
  border-radius: 7px;
  color: #38523a;
  font: inherit;
  font-size: 12px;
  background: #ffffff;
  cursor: pointer;
}

.save-feedback {
  margin: 0;
  padding: 6px 16px;
  border-bottom: 1px solid #ebe8de;
  color: #687064;
  font-size: 12px;
}

.save-feedback--success {
  color: #466846;
  background: #edf5eb;
}

.save-feedback--error {
  color: #a23d35;
  background: #fbeceb;
}

.workbench__body {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 116px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #d8d6cb;
  border-radius: 16px;
  background: #fffdf8;
  box-shadow: 0 14px 40px rgb(43 48 38 / 10%);
}

.workbench__body > :first-child {
  min-height: 0;
  overflow: hidden;
}

.workbench__bridge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  border-left: 1px solid #deddd4;
  border-right: 1px solid #deddd4;
  background:
    linear-gradient(180deg, rgb(47 79 111 / 6%), transparent 40%, rgb(56 82 58 / 6%)),
    #f7f4ec;
}

.workbench__body > :last-child {
  grid-column: 1 / -1;
  min-height: 0;
  max-height: 30vh;
  overflow: auto;
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
  background: #f4f1e8;
}

.model-pane__tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px 10px 0 0;
  color: #5a6258;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
}

.model-pane__tabs button.is-active {
  color: #20251f;
  font-weight: 700;
  background: #fffdf8;
  box-shadow: inset 0 1px 0 #ffffff;
}

.model-pane__badge {
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  color: #2f4f6f;
  font-size: 11px;
  font-weight: 700;
  background: #e4eef6;
}

.model-pane__panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: auto;
  background: #fffdf8;
}

.model-pane__panel--confirmed {
  min-height: 0;
  overflow: hidden;
}

.model-pane__tools {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #deddd4;
  background: #f4f1e8;
}

.model-pane__tools :deep(.structure-query),
.model-pane__tools :deep(.chunk-recall),
.model-pane__tools :deep(.correction-toolkit) {
  flex: 1 1 180px;
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
  border-bottom: 1px solid #deddd4;
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
  color: #5a6258;
  font-size: 12px;
}

.edge-style select,
.layout-reset {
  padding: 5px 8px;
  border: 1px solid #d3d2c8;
  border-radius: 8px;
  color: #3f463d;
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
  border: 1px solid #d3d2c8;
  border-radius: 10px;
  background: #e8e5dc;
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
  color: #5a6258;
  font-size: 12px;
  background: transparent;
}

.view-switcher button.is-active {
  color: #20251f;
  background: #ffffff;
  box-shadow: 0 1px 3px rgb(30 40 30 / 12%);
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
  border: 1px solid #deddd4;
  border-radius: 12px;
  color: inherit;
  text-align: left;
  background: #ffffff;
}

.outline button:hover,
.outline button:focus-visible,
.relation-list button:hover,
.relation-list button:focus-visible {
  border-color: #7e9478;
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
  color: #6d5531;
  font-size: 11px;
  font-weight: 700;
  background: #f2e8d5;
}

.node-type {
  display: inline-flex;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  color: #38523a;
  font-size: 12px;
  font-weight: 700;
  background: #e3eee0;
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
    border-bottom: 1px solid #deddd4;
  }

  .workbench__body > :last-child {
    max-height: none;
  }
}
</style>
