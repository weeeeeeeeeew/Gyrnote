import type { IdentifiedSourceAnchor } from '@/features/source-anchors/domain/source-anchor'

import type { CandidateThoughtModel } from '../domain/thought-model'

export function buildFixtureCandidate(
  noteId: string,
  sourceRevision: number,
  anchors: readonly IdentifiedSourceAnchor[],
): CandidateThoughtModel {
  const firstAnchor = anchors[0]

  if (!firstAnchor) {
    return {
      id: `candidate-${noteId}-${sourceRevision}`,
      noteId,
      sourceRevision,
      title: '待审阅候选模型',
      proposedAnchors: [],
      nodes: [],
      edges: [],
    }
  }

  return {
    id: `candidate-${noteId}-${sourceRevision}`,
    noteId,
    sourceRevision,
    title: '固定 fixture 候选模型',
    proposedAnchors: [],
    nodes: [
      {
        id: 'candidate-observation-1',
        type: 'observation',
        text: firstAnchor.quote,
        sourceAnchorIds: [firstAnchor.id],
        confidence: 0.72,
      },
      {
        id: 'candidate-claim-1',
        type: 'claim',
        text: `基于原文的主张：${firstAnchor.quote}`,
        sourceAnchorIds: [firstAnchor.id],
        confidence: 0.55,
      },
    ],
    edges: [
      {
        id: 'candidate-edge-supports-1',
        sourceNodeId: 'candidate-observation-1',
        targetNodeId: 'candidate-claim-1',
        type: 'supports',
        sourceAnchorIds: [firstAnchor.id],
        confidence: 0.6,
      },
    ],
  }
}
