export const THOUGHT_NODE_TYPES = [
  'question',
  'concept',
  'observation',
  'claim',
  'evidence',
  'assumption',
  'counterpoint',
  'decision',
  'open_question',
  'action',
] as const

export type ThoughtNodeType = (typeof THOUGHT_NODE_TYPES)[number]

export const THOUGHT_EDGE_TYPES = [
  'supports',
  'challenges',
  'depends_on',
  'qualifies',
  'explains',
  'leads_to',
  'answers',
  'tests',
] as const

export type ThoughtEdgeType = (typeof THOUGHT_EDGE_TYPES)[number]
export type ThoughtOrigin = 'ai_created' | 'user_created' | 'user_modified'
export type ThoughtExplicitness = 'explicit' | 'inferred'
export type ThoughtReviewStatus = 'suggested' | 'confirmed' | 'locked' | 'conflicted'

export interface ThoughtNode {
  id: string
  type: ThoughtNodeType
  text: string
  origin: ThoughtOrigin
  explicitness: ThoughtExplicitness
  reviewStatus: ThoughtReviewStatus
  confidence: number | null
  sourceAnchorId: string | null
}

export interface ThoughtEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  type: ThoughtEdgeType
  origin: ThoughtOrigin
  explicitness: ThoughtExplicitness
  reviewStatus: ThoughtReviewStatus
  confidence: number | null
}

export interface ThoughtModel {
  id: string
  noteId: string
  version: number
  title: string
  nodes: ThoughtNode[]
  edges: ThoughtEdge[]
}

/**
 * M1 学习检查点：请实现这个类型守卫。
 *
 * 约束：
 * - 只有 THOUGHT_NODE_TYPES 中的字符串返回 true；
 * - 不能使用 `any` 或类型断言掩盖输入类型；
 * - 完成后运行 `pnpm exec vitest run` 验证。
 */
export function isThoughtNodeType(_value: unknown): _value is ThoughtNodeType {
  if (typeof _value !== 'string') {
    return false
  }
  return THOUGHT_NODE_TYPES.some((type) => _value === type)
}
