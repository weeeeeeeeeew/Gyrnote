import type { ModelPatch } from '../domain/model-patch'
import type { ThoughtModel } from '../domain/thought-model'

/** Deterministic candidate patch for M5.1 UI / store demos (not LLM). */
export function buildFixtureModelPatch(model: ThoughtModel): ModelPatch {
  const question = model.nodes.find((node) => node.id === 'question-direction')
  const evidence = model.nodes.find((node) => node.id === 'evidence-shared-workflow')

  const ops: ModelPatch['ops'] = []
  if (question) {
    ops.push({
      op: 'update_node_text',
      nodeId: question.id,
      text: '两个月内应如何用可验证闭环组织秋招项目？',
    })
  }
  if (evidence) {
    ops.push({
      op: 'delete_node',
      nodeId: evidence.id,
    })
  }

  return {
    id: `fixture-patch-${model.id}`,
    noteId: model.noteId,
    baseModelVersion: model.version,
    reason: 'fixture：演示领域 ModelPatch（改问题文案 + 删除一条证据节点）',
    ops,
  }
}
