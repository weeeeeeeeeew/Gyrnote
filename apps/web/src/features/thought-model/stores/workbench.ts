import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type {
  IdentifiedSourceAnchor,
  SourceAnchor,
} from '@/features/source-anchors/domain/source-anchor'
import { ApiError } from '@/api/http-client'

import type {
  AcceptResult,
  CandidateGenerationStatus,
  CandidateThoughtModel,
  ThoughtEdgeType,
  ThoughtModel,
  ThoughtNodeType,
} from '../domain/thought-model'
import { resolveCustomLabel, toConfirmedThoughtEdge, toConfirmedThoughtNode } from '../domain/thought-model'
import {
  applyModelPatch,
  applyMoveAnchorOps,
  proposePatchFromAnchorResolutions,
  type ModelPatch,
  type ModelPatchAnchorResolution,
  type ModelPatchAnchorResolutionMap,
  type ModelPatchAnchorStatusMap,
} from '../domain/model-patch'
import { hashSourceQuote } from '@/features/source-anchors/domain/quote-hash'
import { extractNoteBlocks } from '@/features/source-anchors/adapters/extract-note-blocks'
import type { JSONContent } from '@tiptap/core'
import { toPersistedThoughtModelPayload } from '@/features/notes/domain/note-persistence'
import { compileCandidateModelViaJob } from '../api/candidate-jobs-api'
import { compileInstructionPatch } from '../api/instruction-patches-api'
import {
  resumePatchReview,
  startPatchReview,
  type PatchReviewStatus,
} from '../api/patch-reviews-api'
import { buildFixtureCandidate } from '../fixtures/candidate-thought-model'
import { buildFixtureModelPatch } from '../fixtures/model-patch'
import { sampleThoughtModel } from '../fixtures/sample-thought-model'
import {
  GRAPH_EDGE_PATH_STYLES,
  type GraphEdgePathStyle,
  type GraphNodePosition,
} from '../adapters/vue-flow'

export type WorkbenchView = 'graph' | 'outline'

export const useThoughtModelWorkbenchStore = defineStore('thought-model-workbench', () => {
  const model = ref<ThoughtModel>(structuredClone(sampleThoughtModel))
  const activeView = ref<WorkbenchView>('graph')
  const selectedNodeId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const sourceAnchors = ref<IdentifiedSourceAnchor[]>([])
  const candidateStatus = ref<CandidateGenerationStatus>('idle')
  const candidateModel = ref<CandidateThoughtModel | null>(null)
  const candidateError = ref<string | null>(null)
  const acceptFeedback = ref<string | null>(null)
  /** Candidate ModelPatch awaiting user approve; never auto-applied. */
  const pendingPatch = ref<ModelPatch | null>(null)
  const patchFeedback = ref<string | null>(null)
  const patchReviewThreadId = ref<string | null>(null)
  const patchReviewStatus = ref<PatchReviewStatus | 'idle'>('idle')
  /** View-layout only; not part of ThoughtModel domain persistence yet. */
  const nodePositions = ref<Record<string, GraphNodePosition>>({})
  const graphEdgePathStyle = ref<GraphEdgePathStyle>('default')
  /** Default relation type when connecting two nodes on the graph. */
  const graphConnectEdgeType = ref<ThoughtEdgeType>('supports')
  /** Maps LLM proposed slug ids -> UUID local SourceAnchor ids. */
  const proposedAnchorIdRemap = ref<Record<string, string>>({})

  const selectedNode = computed(
    () => model.value.nodes.find((node) => node.id === selectedNodeId.value) ?? null,
  )
  const selectedEdge = computed(
    () => model.value.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null,
  )
  const selectedSourceAnchor = computed(() => {
    const sourceAnchorIds = selectedNode.value?.sourceAnchorIds ?? []
    const sourceAnchorId = sourceAnchorIds[0]

    if (!sourceAnchorId) {
      return null
    }

    return sourceAnchors.value.find((anchor) => anchor.id === sourceAnchorId) ?? null
  })

  function selectView(view: WorkbenchView) {
    activeView.value = view
  }

  function selectNode(nodeId: string) {
    selectedNodeId.value = nodeId
    selectedEdgeId.value = null
  }

  function selectEdge(edgeId: string) {
    selectedEdgeId.value = edgeId
    selectedNodeId.value = null
  }

  /**
   * M1 学习检查点：请实现选中节点的文本更新。
   *
   * 约束：
   * - 没有选中节点时返回 false；
   * - text 去掉首尾空白后为空时返回 false；
   * - 成功时只更新当前选中节点的 text，并返回 true；
   * - 不要把 Vue Flow Node/Edge 写进 ThoughtModel。
   */
  function updateSelectedNodeText(_text: string): boolean {
    if (selectedNodeId.value === null) {
      return false
    }
    if (_text.trim() === '') {
      return false
    }

    const node = model.value.nodes.find((node) => node.id === selectedNodeId.value)
    if (!node) {
      return false
    }
    node.text = _text.trim()
    return true
  }

  function updateSelectedEdgeType(edgeType: ThoughtEdgeType): boolean {
    if (selectedEdgeId.value === null) {
      return false
    }

    const edge = model.value.edges.find((candidate) => candidate.id === selectedEdgeId.value)
    if (!edge || edge.type === edgeType) {
      return false
    }

    edge.type = edgeType
    return true
  }

  function attachSourceAnchorToSelectedNode(
    anchor: SourceAnchor,
    anchorId: string = crypto.randomUUID(),
  ): IdentifiedSourceAnchor | null {
    const node = selectedNode.value

    if (!node || !anchorId.trim() || sourceAnchors.value.some((item) => item.id === anchorId)) {
      return null
    }

    const previousAnchorIds = [...node.sourceAnchorIds]
    const identifiedAnchor: IdentifiedSourceAnchor = { id: anchorId, ...anchor }

    sourceAnchors.value.push(identifiedAnchor)
    // Manual attach UX still replaces the binding set with the newly drawn span.
    node.sourceAnchorIds = [anchorId]

    for (const previousAnchorId of previousAnchorIds) {
      if (
        previousAnchorId !== anchorId &&
        !model.value.nodes.some((candidate) => candidate.sourceAnchorIds.includes(previousAnchorId))
      ) {
        sourceAnchors.value = sourceAnchors.value.filter((item) => item.id !== previousAnchorId)
      }
    }

    return identifiedAnchor
  }

  function replaceSourceAnchors(anchors: readonly IdentifiedSourceAnchor[]): void {
    sourceAnchors.value = anchors.map((anchor) => ({ ...anchor }))
  }

  function generateFixtureCandidate(noteId: string, sourceRevision: number): CandidateThoughtModel {
    candidateStatus.value = 'generating'
    candidateError.value = null
    acceptFeedback.value = null
    proposedAnchorIdRemap.value = {}
    try {
      if (!noteId.trim() || !Number.isInteger(sourceRevision) || sourceRevision < 1) {
        throw new Error('候选模型必须绑定有效的 Note revision')
      }
      const candidate = buildFixtureCandidate(noteId, sourceRevision, sourceAnchors.value)
      candidateModel.value = candidate
      candidateStatus.value = 'ready'
      return candidate
    } catch (error) {
      candidateStatus.value = 'error'
      candidateError.value = error instanceof Error ? error.message : '候选模型生成失败'
      throw error
    }
  }

  async function generateCandidateFromApi(
    noteId: string,
    sourceRevision: number,
    title: string,
    noteContent: JSONContent,
  ): Promise<CandidateThoughtModel> {
    candidateStatus.value = 'generating'
    candidateError.value = null
    acceptFeedback.value = null
    proposedAnchorIdRemap.value = {}
    try {
      if (!noteId.trim() || !Number.isInteger(sourceRevision) || sourceRevision < 1) {
        throw new Error('候选模型必须绑定有效的 Note revision')
      }
      const candidate = await compileCandidateModelViaJob({
        note_id: noteId,
        source_revision: sourceRevision,
        title,
        source_anchors: sourceAnchors.value.map((anchor) => ({
          id: anchor.id,
          quote: anchor.quote,
          block_id: anchor.blockId,
        })),
        note_blocks: extractNoteBlocks(noteContent).map((block) => ({
          id: block.id,
          text: block.text,
        })),
      })
      candidateModel.value = candidate
      candidateStatus.value = 'ready'
      return candidate
    } catch (error) {
      candidateStatus.value = 'error'
      candidateError.value = readErrorMessage(error, '候选模型生成失败')
      throw error
    }
  }

  function acceptCandidateNode(candidateNodeId: string): AcceptResult {
    if (!candidateModel.value) {
      return failAccept('尚未生成候选模型')
    }

    const node = candidateModel.value.nodes.find((item) => item.id === candidateNodeId)
    if (!node) {
      return failAccept('找不到该候选节点')
    }

    let materializedAnchor = false
    const remappedSourceAnchorIds: string[] = []
    for (const anchorId of node.sourceAnchorIds) {
      const resolved = resolveLocalSourceAnchorId(anchorId)
      remappedSourceAnchorIds.push(resolved.id)
      if (resolved.materialized) {
        materializedAnchor = true
      }
    }

    const confirmedNode = toConfirmedThoughtNode({
      ...node,
      sourceAnchorIds: [...new Set(remappedSourceAnchorIds)],
    })

    const existingNode = model.value.nodes.find((candidate) => candidate.id === candidateNodeId)
    if (existingNode) {
      if (existingNode.reviewStatus === 'locked') {
        return failAccept('该节点已锁定，不能被候选覆盖')
      }
      Object.assign(existingNode, confirmedNode)
    } else {
      model.value.nodes.push(confirmedNode)
    }

    candidateModel.value = {
      ...candidateModel.value,
      nodes: candidateModel.value.nodes.filter((item) => item.id !== candidateNodeId),
    }

    return okAccept(`已接受节点：${node.text}`, { materializedAnchor })
  }

  function resolveLocalSourceAnchorId(anchorId: string): { id: string; materialized: boolean } {
    const remapped = proposedAnchorIdRemap.value[anchorId]
    if (remapped) {
      return { id: remapped, materialized: false }
    }
    if (sourceAnchors.value.some((anchor) => anchor.id === anchorId)) {
      return { id: anchorId, materialized: false }
    }

    const proposed = candidateModel.value?.proposedAnchors.find((anchor) => anchor.id === anchorId)
    if (!proposed) {
      return { id: anchorId, materialized: false }
    }

    // Note persistence requires UUID anchor ids; LLM proposed ids are usually slugs.
    const localId = isUuid(anchorId) ? anchorId : crypto.randomUUID()
    if (localId !== anchorId) {
      proposedAnchorIdRemap.value = {
        ...proposedAnchorIdRemap.value,
        [anchorId]: localId,
      }
    }

    sourceAnchors.value.push({
      id: localId,
      blockId: proposed.blockId,
      startOffset: proposed.startOffset,
      endOffset: proposed.endOffset,
      quote: proposed.quote,
      quoteHash: hashSourceQuote(proposed.quote),
    })
    return { id: localId, materialized: true }
  }

  function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  }

  function lockSelectedNode(): boolean {
    if (!selectedNode.value) {
      return false
    }
    if (selectedNode.value.reviewStatus === 'locked') {
      return false
    }
    selectedNode.value.reviewStatus = 'locked'

    return true
  }

  /**
   * #6 学习检查点：解锁当前选中节点。
   *
   * 约束：
   * - 无选中节点 → false；
   * - 当前不是 locked → false；
   * - 成功时只把 reviewStatus 改回 confirmed，其它字段不动。
   */
  function unlockSelectedNode(): boolean {
    if (!selectedNode.value) {
      return false
    }
    if (selectedNode.value.reviewStatus !== 'locked') {
      return false
    }
    selectedNode.value.reviewStatus = 'confirmed'
    return true
  }

  /**
   * #3 学习检查点：删除当前选中的确认节点。
   *
   * 约束：
   * - 无选中节点 → false；
   * - reviewStatus === 'locked' → false（模型不变）；
   * - 成功时从 model.nodes 移除该节点；
   * - 同时移除所有以该节点为端点的 edges（避免悬空引用）；
   * - 清空 selectedNodeId；
   * - 不要整表替换 model，不要动 candidateModel / sourceAnchors。
   */
  function deleteSelectedNode(): boolean {
    if (!selectedNode.value) {
      return false
    }
    if (selectedNode.value.reviewStatus === 'locked') {
      return false
    }
    const nodeId = selectedNode.value!.id
    model.value.nodes = model.value.nodes.filter((node) => node.id !== nodeId)
    model.value.edges = model.value.edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId)
    selectedNodeId.value = null
    pruneNodePositions()
    return true
  }

  function deleteSelectedEdge(): boolean {
    if (!selectedEdgeId.value) {
      return false
    }

    const edgeId = selectedEdgeId.value
    const nextEdges = model.value.edges.filter((edge) => edge.id !== edgeId)
    if (nextEdges.length === model.value.edges.length) {
      return false
    }

    model.value.edges = nextEdges
    selectedEdgeId.value = null
    return true
  }

  function acceptCandidateEdge(candidateEdgeId: string): AcceptResult {
    if (!candidateModel.value) {
      return failAccept('尚未生成候选模型')
    }
    if (!candidateEdgeId) {
      return failAccept('关系 id 无效')
    }

    const edge = candidateModel.value.edges.find((item) => item.id === candidateEdgeId)
    if (!edge) {
      return failAccept('找不到该候选关系')
    }

    const sourceNode = model.value.nodes.find((node) => node.id === edge.sourceNodeId)
    if (!sourceNode) {
      return failAccept('请先接受关系的起点节点')
    }

    const targetNode = model.value.nodes.find((node) => node.id === edge.targetNodeId)
    if (!targetNode) {
      return failAccept('请先接受关系的终点节点')
    }

    const existingEdge = model.value.edges.find((item) => item.id === candidateEdgeId)
    if (existingEdge) {
      Object.assign(existingEdge, toConfirmedThoughtEdge(edge))
    } else {
      model.value.edges.push(toConfirmedThoughtEdge(edge))
    }

    candidateModel.value = {
      ...candidateModel.value,
      edges: candidateModel.value.edges.filter((item) => item.id !== candidateEdgeId),
    }

    return okAccept(`已接受关系：${edge.type}`)
  }

  function failAccept(message: string): AcceptResult {
    acceptFeedback.value = message
    return { ok: false, message }
  }

  function okAccept(
    message: string,
    extras: { materializedAnchor?: boolean } = {},
  ): AcceptResult {
    acceptFeedback.value = message
    return { ok: true, message, ...extras }
  }

  /**
   * M4 校正工具检查点：手工新建确认节点。
   *
   * 约束：
   * - text trim 后为空 → false；
   * - 成功时追加到 model.nodes：origin=user_created，explicitness=explicit，
   *   reviewStatus=confirmed，confidence=null，sourceAnchorIds=[]；
   * - id 需唯一（可用 crypto.randomUUID 前缀）；
   * - 选中新建节点；不要动 candidateModel。
   */
  function createConfirmedNode(input: {
    type: ThoughtNodeType
    text: string
    label?: string | null
  }): boolean {
    const text = input.text.trim()
    if (text === '') {
      return false
    }
    const label = resolveCustomLabel(input.type, input.label)
    if (input.type === 'custom' && label === null) {
      return false
    }
    const id = `user-node-${crypto.randomUUID()}`
    model.value.nodes.push({
      id,
      text,
      type: input.type,
      label,
      origin: 'user_created',
      explicitness: 'explicit',
      reviewStatus: 'confirmed',
      confidence: null,
      sourceAnchorIds: [],
    })
    selectNode(id)
    return true
  }

  function setNodePosition(nodeId: string, position: GraphNodePosition): boolean {
    if (!model.value.nodes.some((node) => node.id === nodeId)) {
      return false
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return false
    }
    nodePositions.value = {
      ...nodePositions.value,
      [nodeId]: { x: position.x, y: position.y },
    }
    return true
  }

  function setGraphEdgePathStyle(style: GraphEdgePathStyle): boolean {
    if (!GRAPH_EDGE_PATH_STYLES.includes(style)) {
      return false
    }
    graphEdgePathStyle.value = style
    return true
  }

  function resetGraphLayout(): void {
    nodePositions.value = {}
  }

  function connectNodesOnGraph(sourceNodeId: string, targetNodeId: string): boolean {
    return createConfirmedEdge({
      sourceNodeId,
      targetNodeId,
      type: graphConnectEdgeType.value,
    })
  }

  function pruneNodePositions(): void {
    const alive = new Set(model.value.nodes.map((node) => node.id))
    const next: Record<string, GraphNodePosition> = {}
    for (const [id, position] of Object.entries(nodePositions.value)) {
      if (alive.has(id)) {
        next[id] = position
      }
    }
    nodePositions.value = next
  }

  function createConfirmedEdge(input: {
    sourceNodeId: string
    targetNodeId: string
    type: ThoughtEdgeType
    label?: string | null
  }): boolean {
    const sourceNodeId = input.sourceNodeId.trim()
    const targetNodeId = input.targetNodeId.trim()
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
      return false
    }

    const sourceExists = model.value.nodes.some((node) => node.id === sourceNodeId)
    const targetExists = model.value.nodes.some((node) => node.id === targetNodeId)
    if (!sourceExists || !targetExists) {
      return false
    }

    const label = resolveCustomLabel(input.type, input.label)
    if (input.type === 'custom' && label === null) {
      return false
    }

    const id = `user-edge-${crypto.randomUUID()}`
    model.value.edges.push({
      id,
      sourceNodeId,
      targetNodeId,
      type: input.type,
      label,
      origin: 'user_created',
      explicitness: 'explicit',
      reviewStatus: 'confirmed',
      confidence: null,
    })
    selectEdge(id)
    return true
  }

  function loadFixtureModelPatch(): boolean {
    const patch = buildFixtureModelPatch(model.value)
    if (patch.ops.length === 0) {
      pendingPatch.value = null
      patchFeedback.value = '当前确认模型无法生成 fixture patch'
      return false
    }
    pendingPatch.value = patch
    patchFeedback.value = null
    return true
  }

  /**
   * Candidate patch from current note vs confirmed node anchors.
   * Does not write the confirmed model; user must approve.
   */
  function loadPatchFromAnchorStatuses(
    statuses: ModelPatchAnchorStatusMap | ModelPatchAnchorResolutionMap | null,
  ): boolean {
    if (!statuses) {
      pendingPatch.value = null
      patchFeedback.value = '笔记编辑器未就绪，无法对照原文锚点'
      return false
    }

    const result = proposePatchFromAnchorResolutions(
      model.value,
      toAnchorResolutionMap(statuses),
      sourceAnchors.value,
    )
    if (!result.ok) {
      pendingPatch.value = null
      patchFeedback.value = result.reason
      return false
    }

    pendingPatch.value = result.patch
    patchFeedback.value = null
    return true
  }

  /**
   * Candidate patch from a natural-language instruction.
   * Never writes the confirmed model; caller starts interrupt review.
   */
  async function compileInstructionPatchFromInstruction(instruction: string): Promise<boolean> {
    const text = instruction.trim()
    if (!text) {
      patchFeedback.value = '请输入改图指令'
      return false
    }
    const noteId = model.value.noteId.trim()
    if (!noteId) {
      patchFeedback.value = '当前确认模型未绑定笔记'
      return false
    }
    try {
      const patch = await compileInstructionPatch({
        instruction: text,
        note_id: noteId,
        thought_model: toPersistedThoughtModelPayload(model.value),
        source_anchors: sourceAnchors.value.map((anchor) => ({
          id: anchor.id,
          block_id: anchor.blockId,
          start_offset: anchor.startOffset,
          end_offset: anchor.endOffset,
        })),
      })
      pendingPatch.value = patch
      patchFeedback.value = null
      clearPatchReviewSession()
      return true
    } catch (error) {
      pendingPatch.value = null
      clearPatchReviewSession()
      patchFeedback.value = readErrorMessage(error, '无法根据指令生成候选 patch')
      return false
    }
  }

  function clearPatchReviewSession(): void {
    patchReviewThreadId.value = null
    patchReviewStatus.value = 'idle'
  }

  function dismissPendingPatch(): void {
    pendingPatch.value = null
    patchFeedback.value = null
    clearPatchReviewSession()
  }

  async function startPendingPatchReview(): Promise<boolean> {
    if (!pendingPatch.value) {
      patchFeedback.value = '没有待批准的 patch'
      return false
    }
    try {
      const snapshot = await startPatchReview({
        patchId: pendingPatch.value.id,
        ops: pendingPatch.value.ops as unknown as Array<Record<string, unknown>>,
      })
      patchReviewThreadId.value = snapshot.threadId
      patchReviewStatus.value = snapshot.status
      patchFeedback.value = '审阅已暂停，等待批准或拒绝'
      return true
    } catch (error) {
      clearPatchReviewSession()
      patchFeedback.value = readErrorMessage(error, '无法启动补丁审阅')
      return false
    }
  }

  async function approvePendingPatchViaReview(): Promise<boolean> {
    if (!pendingPatch.value) {
      patchFeedback.value = '没有待批准的 patch'
      return false
    }
    if (patchReviewStatus.value === 'approved') {
      return applyPendingPatch()
    }
    if (!patchReviewThreadId.value) {
      const started = await startPendingPatchReview()
      if (!started || !patchReviewThreadId.value) {
        return false
      }
    }
    try {
      const snapshot = await resumePatchReview({
        threadId: patchReviewThreadId.value,
        decision: 'approve',
      })
      patchReviewStatus.value = snapshot.status
      if (snapshot.status !== 'approved') {
        patchFeedback.value = '审阅未批准，未写入确认模型'
        return false
      }
      return applyPendingPatch()
    } catch (error) {
      patchFeedback.value = readErrorMessage(error, '无法恢复补丁审阅')
      return false
    }
  }

  async function rejectPendingPatchViaReview(): Promise<boolean> {
    if (!pendingPatch.value || !patchReviewThreadId.value) {
      dismissPendingPatch()
      return true
    }
    try {
      const snapshot = await resumePatchReview({
        threadId: patchReviewThreadId.value,
        decision: 'reject',
      })
      patchReviewStatus.value = snapshot.status
      if (snapshot.status !== 'rejected') {
        patchFeedback.value = '审阅未拒绝'
        return false
      }
      dismissPendingPatch()
      return true
    } catch (error) {
      patchFeedback.value = readErrorMessage(error, '无法拒绝补丁审阅')
      return false
    }
  }

  /**
   * Approve pending ModelPatch into the confirmed model.
   * Returns false when missing / invalid; never partially applies.
   */
  function applyPendingPatch(): boolean {
    if (!pendingPatch.value) {
      patchFeedback.value = '没有待批准的 patch'
      return false
    }

    const patch = pendingPatch.value
    const moveOps = patch.ops.filter(
      (op): op is Extract<ModelPatch['ops'][number], { op: 'move_anchor' }> =>
        op.op === 'move_anchor',
    )
    const modelOps = patch.ops.filter((op) => op.op !== 'move_anchor')

    let nextAnchors = sourceAnchors.value.map((anchor) => ({ ...anchor }))
    if (moveOps.length > 0) {
      const moved = applyMoveAnchorOps(nextAnchors, moveOps)
      if (!moved.ok) {
        patchFeedback.value = moved.error
        return false
      }
      nextAnchors = moved.anchors
    }

    if (modelOps.length > 0) {
      const result = applyModelPatch(model.value, { ...patch, ops: modelOps })
      if (!result.ok) {
        patchFeedback.value = result.errors.join('；')
        return false
      }
      model.value = result.model
      pruneNodePositions()
    }

    sourceAnchors.value = nextAnchors
    selectedNodeId.value = null
    selectedEdgeId.value = null
    pendingPatch.value = null
    patchFeedback.value = `已应用 ${patch.ops.length} 条操作`
    clearPatchReviewSession()
    return true
  }

  function replaceConfirmedModel(next: ThoughtModel): void {
    model.value = structuredClone(next)
    selectedNodeId.value = null
    selectedEdgeId.value = null
    candidateModel.value = null
    candidateStatus.value = 'idle'
    candidateError.value = null
    acceptFeedback.value = null
    pendingPatch.value = null
    patchFeedback.value = null
    proposedAnchorIdRemap.value = {}
    clearPatchReviewSession()
    resetGraphLayout()
    graphEdgePathStyle.value = 'default'
  }

  function replaceGraphLayout(layout: {
    nodePositions: Readonly<Record<string, GraphNodePosition>>
    edgePathStyle?: GraphEdgePathStyle
  }): void {
    const next: Record<string, GraphNodePosition> = {}
    const alive = new Set(model.value.nodes.map((node) => node.id))
    for (const [nodeId, position] of Object.entries(layout.nodePositions)) {
      if (!alive.has(nodeId)) {
        continue
      }
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        continue
      }
      next[nodeId] = { x: position.x, y: position.y }
    }
    nodePositions.value = next
    if (layout.edgePathStyle !== undefined) {
      setGraphEdgePathStyle(layout.edgePathStyle)
    }
  }

  function syncModelNoteIdentity(noteId: string, title?: string): void {
    model.value = {
      ...model.value,
      noteId,
      ...(title !== undefined ? { title } : {}),
    }
  }

  return {
    model,
    activeView,
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedEdge,
    sourceAnchors,
    candidateStatus,
    candidateModel,
    candidateError,
    acceptFeedback,
    pendingPatch,
    patchFeedback,
    patchReviewThreadId,
    patchReviewStatus,
    selectedSourceAnchor,
    nodePositions,
    graphEdgePathStyle,
    graphConnectEdgeType,
    selectView,
    selectNode,
    selectEdge,
    updateSelectedNodeText,
    updateSelectedEdgeType,
    attachSourceAnchorToSelectedNode,
    replaceSourceAnchors,
    replaceConfirmedModel,
    replaceGraphLayout,
    syncModelNoteIdentity,
    generateFixtureCandidate,
    generateCandidateFromApi,
    acceptCandidateNode,
    acceptCandidateEdge,
    lockSelectedNode,
    unlockSelectedNode,
    deleteSelectedNode,
    deleteSelectedEdge,
    createConfirmedNode,
    createConfirmedEdge,
    setNodePosition,
    setGraphEdgePathStyle,
    resetGraphLayout,
    connectNodesOnGraph,
    loadFixtureModelPatch,
    loadPatchFromAnchorStatuses,
    compileInstructionPatchFromInstruction,
    startPendingPatchReview,
    approvePendingPatchViaReview,
    rejectPendingPatchViaReview,
    applyPendingPatch,
    dismissPendingPatch,
  }
})

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (isRecord(error.data) && typeof error.data.detail === 'string') {
      return error.data.detail
    }
    return error.message || fallback
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toAnchorResolutionMap(
  input: ModelPatchAnchorStatusMap | ModelPatchAnchorResolutionMap,
): ModelPatchAnchorResolutionMap {
  const next: Record<string, ModelPatchAnchorResolution> = {}
  for (const [anchorId, value] of Object.entries(input)) {
    next[anchorId] = typeof value === 'string' ? { status: value } : value
  }
  return next
}
