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
  'custom',
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
  'custom',
] as const

export type ThoughtEdgeType = (typeof THOUGHT_EDGE_TYPES)[number]
export type ThoughtOrigin = 'ai_created' | 'user_created' | 'user_modified'
export type ThoughtExplicitness = 'explicit' | 'inferred'
export type ThoughtReviewStatus = 'suggested' | 'confirmed' | 'locked' | 'conflicted'

export interface ThoughtNode {
  id: string
  type: ThoughtNodeType
  /** Only meaningful when type === 'custom'; otherwise null. */
  label: string | null
  text: string
  origin: ThoughtOrigin
  explicitness: ThoughtExplicitness
  reviewStatus: ThoughtReviewStatus
  confidence: number | null
  /**
   * Empty = unbound. Multiple ids = cross-block / discontinuous evidence.
   * Graph and note are loosely coupled (意合而不形合): nodes need not cover the whole note.
   */
  sourceAnchorIds: string[]
}

export interface ThoughtEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  type: ThoughtEdgeType
  /** Only meaningful when type === 'custom'; otherwise null. */
  label: string | null
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

export function createBlankThoughtModel(title = '未命名笔记'): ThoughtModel {
  return {
    id: 'model-draft',
    noteId: '',
    version: 1,
    title,
    nodes: [],
    edges: [],
  }
}

export type CandidateGenerationStatus = 'idle' | 'generating' | 'ready' | 'error'

/** Accept action result for UI feedback (M4 #2). */
export type AcceptResult =
  | { ok: true; message: string; materializedAnchor?: boolean }
  | { ok: false; message: string }

export interface CandidateThoughtNode {
  id: string
  type: ThoughtNodeType
  label?: string | null
  text: string
  /** Non-empty. Multiple ids allow cross-block / discontinuous evidence. */
  sourceAnchorIds: string[]
  confidence: number
}

export interface CandidateThoughtEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  type: ThoughtEdgeType
  label?: string | null
  sourceAnchorIds: string[]
  confidence: number
}

export interface ProposedSourceAnchor {
  id: string
  blockId: string
  quote: string
  startOffset: number
  endOffset: number
}

export interface CandidateThoughtModel {
  id: string
  noteId: string
  sourceRevision: number
  title: string
  proposedAnchors: ProposedSourceAnchor[]
  nodes: CandidateThoughtNode[]
  edges: CandidateThoughtEdge[]
}

/**
 * 将单个候选节点映射为确认模型节点。
 *
 * 语义约定（M4.1）：
 * - 保留 id / type / text / sourceAnchorIds / confidence；
 * - origin = ai_created（来自候选编译，非用户手工新建）；
 * - explicitness = inferred（结构由编译推断；原文锚定仍靠 sourceAnchorIds）；
 * - reviewStatus = confirmed（用户已接受，尚未进入 locked）。
 */
export function toConfirmedThoughtNode(candidate: CandidateThoughtNode): ThoughtNode {
  return {
    id: candidate.id,
    type: candidate.type,
    label: resolveCustomLabel(candidate.type, candidate.label),
    text: candidate.text,
    origin: 'ai_created',
    explicitness: 'inferred',
    reviewStatus: 'confirmed',
    confidence: candidate.confidence,
    sourceAnchorIds: [...candidate.sourceAnchorIds],
  }
}

/**
 * 将单个候选关系映射为确认模型关系。
 *
 * 语义约定（M4.2）：
 * - 保留 id / sourceNodeId / targetNodeId / type / confidence；
 * - origin = ai_created；explicitness = inferred；reviewStatus = confirmed；
 * - 候选侧的 sourceAnchorIds 不写入 ThoughtEdge（确认边目前无多锚点字段）。
 */
export function toConfirmedThoughtEdge(candidate: CandidateThoughtEdge): ThoughtEdge {
  return {
    id: candidate.id,
    sourceNodeId: candidate.sourceNodeId,
    targetNodeId: candidate.targetNodeId,
    type: candidate.type,
    label: resolveCustomLabel(candidate.type, candidate.label),
    origin: 'ai_created',
    explicitness: 'inferred',
    reviewStatus: 'confirmed',
    confidence: candidate.confidence,
  }
}

/**
 * #4 学习检查点：规范化 custom 标签。
 *
 * 约束：
 * - type !== 'custom' → 一律返回 null（忽略传入 label）；
 * - type === 'custom'：trim 后为空 → null；否则返回 trim 后的字符串。
 */
export function resolveCustomLabel(
  _type: ThoughtNodeType | ThoughtEdgeType,
  _label: string | null | undefined,
): string | null {
  if (_type !== 'custom') {
    return null
  }
  if (_label === null || _label === undefined) {
    return null
  }
  const text = _label.trim()
  if (text === '') {
    return null
  }
  return text
}

/** Display badge/text for a typed entity; custom falls back to "custom" if label missing. */
export function displayThoughtTypeLabel(
  type: ThoughtNodeType | ThoughtEdgeType,
  label: string | null | undefined,
): string {
  if (type === 'custom') {
    return resolveCustomLabel(type, label) ?? 'custom'
  }
  return type
}

/**
 * M3 用户学习检查点：请实现候选节点的运行时类型守卫。
 * 不能使用 any 或类型断言掩盖输入类型；需校验必填字段、节点类型、非空锚点 ID
 * 和 0 到 1 之间的 confidence。
 */
export function isCandidateThoughtNode(_value: unknown): _value is CandidateThoughtNode {
  if (!isRecord(_value)) {
    return false
  }

  const { id, type, text, sourceAnchorIds, confidence } = _value

  if (
    typeof id !== 'string' ||
    typeof type !== 'string' ||
    typeof text !== 'string' ||
    !Array.isArray(sourceAnchorIds) ||
    typeof confidence !== 'number'
  ) {
    return false
  }
  if (id === '' || text === '') {
    return false
  }
  if (sourceAnchorIds.length === 0) {
    return false
  }
  if (!sourceAnchorIds.every((item) => typeof item === 'string' && item !== '')) {
    return false
  }
  if (!isThoughtNodeType(type)) {
    return false
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return false
  }

  return true
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

export function isThoughtEdgeType(value: unknown): value is ThoughtEdgeType {
  if (typeof value !== 'string') {
    return false
  }
  return THOUGHT_EDGE_TYPES.some((type) => value === type)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}