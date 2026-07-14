import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ThoughtEdgeType, ThoughtModel } from '../domain/thought-model'
import { sampleThoughtModel } from '../fixtures/sample-thought-model'

export type WorkbenchView = 'graph' | 'outline'

export const useThoughtModelWorkbenchStore = defineStore('thought-model-workbench', () => {
  const model = ref<ThoughtModel>(structuredClone(sampleThoughtModel))
  const activeView = ref<WorkbenchView>('outline')
  const selectedNodeId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)

  const selectedNode = computed(
    () => model.value.nodes.find((node) => node.id === selectedNodeId.value) ?? null,
  )
  const selectedEdge = computed(
    () => model.value.edges.find((edge) => edge.id === selectedEdgeId.value) ?? null,
  )

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

  return {
    model,
    activeView,
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedEdge,
    selectView,
    selectNode,
    selectEdge,
    updateSelectedNodeText,
    updateSelectedEdgeType,
  }
})
