import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { hashSourceQuote } from '@/features/source-anchors/domain/quote-hash'
import type { SourceAnchor } from '@/features/source-anchors/domain/source-anchor'

import { useThoughtModelWorkbenchStore } from './workbench'

describe('useThoughtModelWorkbenchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens the graph view by default', () => {
    const workbench = useThoughtModelWorkbenchStore()
    expect(workbench.activeView).toBe('graph')
  })

  it('does not update node text when no node is selected', () => {
    const workbench = useThoughtModelWorkbenchStore()
    const originalText = getNodeText(workbench, 'claim-product-engineer')

    expect(workbench.updateSelectedNodeText('新的项目定位')).toBe(false)
    expect(getNodeText(workbench, 'claim-product-engineer')).toBe(originalText)
  })

  it('does not update node text with blank input', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')
    const originalText = getNodeText(workbench, 'claim-product-engineer')

    expect(workbench.updateSelectedNodeText('   ')).toBe(false)
    expect(getNodeText(workbench, 'claim-product-engineer')).toBe(originalText)
  })

  it('updates the selected ThoughtNode text in the domain model', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')

    expect(workbench.updateSelectedNodeText('以可解释的复杂前端交互为项目锚点')).toBe(true)
    expect(getNodeText(workbench, 'claim-product-engineer')).toBe(
      '以可解释的复杂前端交互为项目锚点',
    )
    expect(workbench.selectedNode?.text).toBe('以可解释的复杂前端交互为项目锚点')
  })

  it('keeps node and edge selection mutually exclusive', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')
    expect(workbench.selectedNode?.id).toBe('claim-product-engineer')
    expect(workbench.selectedEdge).toBeNull()

    workbench.selectEdge('edge-evidence-supports-claim')
    expect(workbench.selectedNode).toBeNull()
    expect(workbench.selectedEdge?.id).toBe('edge-evidence-supports-claim')
  })

  it('does not update an edge type when no edge is selected', () => {
    const workbench = useThoughtModelWorkbenchStore()

    expect(workbench.updateSelectedEdgeType('challenges')).toBe(false)
    expect(getEdgeType(workbench, 'edge-evidence-supports-claim')).toBe('supports')
  })

  it('does not update an edge when its type is unchanged', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectEdge('edge-evidence-supports-claim')

    expect(workbench.updateSelectedEdgeType('supports')).toBe(false)
    expect(getEdgeType(workbench, 'edge-evidence-supports-claim')).toBe('supports')
  })

  it('updates only the selected ThoughtEdge type in the domain model', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectEdge('edge-evidence-supports-claim')

    expect(workbench.updateSelectedEdgeType('challenges')).toBe(true)
    expect(getEdgeType(workbench, 'edge-evidence-supports-claim')).toBe('challenges')
    expect(getEdgeType(workbench, 'edge-claim-answers-question')).toBe('answers')
    expect(workbench.selectedEdge?.type).toBe('challenges')
  })

  it('attaches a source anchor to the selected ThoughtNode', () => {
    const workbench = useThoughtModelWorkbenchStore()
    const anchor = createAnchor()

    expect(workbench.attachSourceAnchorToSelectedNode(anchor, 'anchor-first')).toBeNull()

    workbench.selectNode('claim-product-engineer')

    expect(workbench.attachSourceAnchorToSelectedNode(anchor, 'anchor-first')).toEqual({
      id: 'anchor-first',
      ...anchor,
    })
    expect(workbench.selectedNode?.sourceAnchorIds).toEqual(['anchor-first'])
    expect(workbench.selectedSourceAnchor).toEqual({ id: 'anchor-first', ...anchor })
  })

  it('replaces an anchor and removes the unreferenced local record', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.selectNode('claim-product-engineer')
    workbench.attachSourceAnchorToSelectedNode(createAnchor(), 'anchor-first')
    workbench.attachSourceAnchorToSelectedNode(
      createAnchor({ quote: '新原文', quoteHash: hashSourceQuote('新原文') }),
      'anchor-second',
    )

    expect(workbench.selectedNode?.sourceAnchorIds).toEqual(['anchor-second'])
    expect(workbench.sourceAnchors.map((anchor) => anchor.id)).toEqual(['anchor-second'])
  })

  it('replaces local anchors with a persisted note snapshot', () => {
    const workbench = useThoughtModelWorkbenchStore()

    workbench.replaceSourceAnchors([
      { id: 'anchor-persisted', ...createAnchor({ blockId: 'block-persisted' }) },
    ])

    expect(workbench.sourceAnchors).toEqual([
      {
        id: 'anchor-persisted',
        ...createAnchor({ blockId: 'block-persisted' }),
      },
    ])
  })

  it('stores generated candidates separately without changing the confirmed model', () => {
    const workbench = useThoughtModelWorkbenchStore()
    const originalModel = JSON.parse(JSON.stringify(workbench.model))
    workbench.replaceSourceAnchors([
      { id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) },
    ])

    const candidate = workbench.generateFixtureCandidate('note-1', 4)

    expect(workbench.candidateStatus).toBe('ready')
    expect(workbench.candidateModel).toEqual(candidate)
    expect(workbench.model).toEqual(originalModel)
  })

  it('moves to error when the candidate input is not bound to a valid revision', () => {
    const workbench = useThoughtModelWorkbenchStore()

    expect(() => workbench.generateFixtureCandidate('note-1', 0)).toThrow(
      '候选模型必须绑定有效的 Note revision',
    )
    expect(workbench.candidateStatus).toBe('error')
    expect(workbench.candidateError).toBe('候选模型必须绑定有效的 Note revision')
  })

  describe('acceptCandidateNode (M4 learning checkpoint)', () => {
    it('returns false when there is no candidate model', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(false)
    })

    it('returns false when the candidate node id is missing', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 2)

      expect(workbench.acceptCandidateNode('missing-node').ok).toBe(false)
      expect(workbench.model.nodes.some((node) => node.id === 'missing-node')).toBe(false)
    })

    it('accepts one candidate node into the confirmed model without touching other candidates', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const confirmedNodeCount = workbench.model.nodes.length
      const confirmedEdgeSnapshot = JSON.parse(JSON.stringify(workbench.model.edges))

      workbench.replaceSourceAnchors([
        { id: 'anchor-1', ...createAnchor({ quote: '第一段原文' }) },
        { id: 'anchor-2', ...createAnchor({ quote: '第二段原文', blockId: 'block-2' }) },
      ])
      workbench.generateFixtureCandidate('note-1', 3)

      // Expand the fixture-style candidate with a second unaccepted node.
      workbench.candidateModel = {
        ...workbench.candidateModel!,
        nodes: [
          ...workbench.candidateModel!.nodes,
          {
            id: 'candidate-claim-2',
            type: 'claim',
            text: '尚未接受的主张',
            sourceAnchorIds: ['anchor-2'],
            confidence: 0.4,
          },
        ],
      }

      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(true)

      const accepted = workbench.model.nodes.find((node) => node.id === 'candidate-observation-1')
      expect(accepted).toEqual({
        id: 'candidate-observation-1',
        type: 'observation',
        label: null,
        text: '第一段原文',
        origin: 'ai_created',
        explicitness: 'inferred',
        reviewStatus: 'confirmed',
        confidence: 0.72,
        sourceAnchorIds: ['anchor-1'],
      })
      expect(workbench.model.nodes).toHaveLength(confirmedNodeCount + 1)
      expect(workbench.model.edges).toEqual(confirmedEdgeSnapshot)
      expect(workbench.model.nodes.some((node) => node.id === 'candidate-claim-2')).toBe(false)
      expect(workbench.candidateModel?.nodes.map((node) => node.id)).toEqual([
        'candidate-claim-1',
        'candidate-claim-2',
      ])
      expect(
        workbench.candidateModel?.nodes.some((node) => node.id === 'candidate-observation-1'),
      ).toBe(false)
    })

    it('keeps confirmed structure when regenerating candidates after accept', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 1)
      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(true)

      const confirmedAfterAccept = JSON.parse(JSON.stringify(workbench.model))
      workbench.generateFixtureCandidate('note-1', 2)

      expect(workbench.model).toEqual(confirmedAfterAccept)
      expect(workbench.candidateModel?.sourceRevision).toBe(2)
      expect(workbench.candidateStatus).toBe('ready')
    })
  })

  describe('acceptCandidateEdge (M4.2 learning checkpoint)', () => {
    it('returns false when there is no candidate model', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.acceptCandidateEdge('candidate-edge-supports-1').ok).toBe(false)
    })

    it('returns false when either endpoint is missing from the confirmed model', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 1)
      workbench.acceptCandidateNode('candidate-observation-1')

      const result = workbench.acceptCandidateEdge('candidate-edge-supports-1')
      expect(result.ok).toBe(false)
      expect(result.message).toContain('终点节点')
      expect(workbench.acceptFeedback).toContain('终点节点')
      expect(workbench.model.edges.some((edge) => edge.id === 'candidate-edge-supports-1')).toBe(
        false,
      )
    })

    it('accepts one candidate edge after both endpoints are confirmed', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const confirmedNodeSnapshot = JSON.parse(JSON.stringify(workbench.model.nodes))
      const confirmedEdgeCount = workbench.model.edges.length

      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 1)
      workbench.acceptCandidateNode('candidate-observation-1')
      workbench.acceptCandidateNode('candidate-claim-1')

      expect(workbench.acceptCandidateEdge('candidate-edge-supports-1').ok).toBe(true)

      const accepted = workbench.model.edges.find((edge) => edge.id === 'candidate-edge-supports-1')
      expect(accepted).toEqual({
        id: 'candidate-edge-supports-1',
        sourceNodeId: 'candidate-observation-1',
        targetNodeId: 'candidate-claim-1',
        type: 'supports',
        label: null,
        origin: 'ai_created',
        explicitness: 'inferred',
        reviewStatus: 'confirmed',
        confidence: 0.6,
      })
      expect(workbench.model.edges).toHaveLength(confirmedEdgeCount + 1)
      expect(workbench.model.nodes.slice(0, confirmedNodeSnapshot.length)).toEqual(
        expect.arrayContaining(confirmedNodeSnapshot),
      )
      expect(workbench.candidateModel?.edges.map((edge) => edge.id)).toEqual([])
      expect(
        workbench.candidateModel?.edges.some((edge) => edge.id === 'candidate-edge-supports-1'),
      ).toBe(false)
    })

    it('keeps confirmed edges when regenerating candidates after accept', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 1)
      workbench.acceptCandidateNode('candidate-observation-1')
      workbench.acceptCandidateNode('candidate-claim-1')
      expect(workbench.acceptCandidateEdge('candidate-edge-supports-1').ok).toBe(true)

      const confirmedAfterAccept = JSON.parse(JSON.stringify(workbench.model))
      workbench.generateFixtureCandidate('note-1', 2)

      expect(workbench.model).toEqual(confirmedAfterAccept)
      expect(workbench.candidateModel?.sourceRevision).toBe(2)
    })
  })

  describe('lockSelectedNode (M4.3 learning checkpoint)', () => {
    it('returns false when no node is selected', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.lockSelectedNode()).toBe(false)
    })

    it('locks the selected confirmed node without changing other fields', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('claim-product-engineer')
      const before = JSON.parse(
        JSON.stringify(workbench.model.nodes.find((node) => node.id === 'claim-product-engineer')),
      )

      expect(workbench.lockSelectedNode()).toBe(true)
      expect(workbench.selectedNode?.reviewStatus).toBe('locked')
      expect(workbench.selectedNode).toMatchObject({
        ...before,
        reviewStatus: 'locked',
      })
    })

    it('returns false when the selected node is already locked', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('claim-product-engineer')
      expect(workbench.lockSelectedNode()).toBe(true)
      expect(workbench.lockSelectedNode()).toBe(false)
      expect(workbench.selectedNode?.reviewStatus).toBe('locked')
    })
  })

  describe('unlockSelectedNode (#6 learning checkpoint)', () => {
    it('returns false when no node is selected', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.unlockSelectedNode()).toBe(false)
    })

    it('returns false when the selected node is not locked', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('claim-product-engineer')

      expect(workbench.selectedNode?.reviewStatus).toBe('confirmed')
      expect(workbench.unlockSelectedNode()).toBe(false)
      expect(workbench.selectedNode?.reviewStatus).toBe('confirmed')
    })

    it('unlocks a locked node back to confirmed without changing other fields', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('claim-product-engineer')
      expect(workbench.lockSelectedNode()).toBe(true)
      const before = JSON.parse(
        JSON.stringify(workbench.model.nodes.find((node) => node.id === 'claim-product-engineer')),
      )

      expect(workbench.unlockSelectedNode()).toBe(true)
      expect(workbench.selectedNode?.reviewStatus).toBe('confirmed')
      expect(workbench.selectedNode).toMatchObject({
        ...before,
        reviewStatus: 'confirmed',
      })
    })
  })

  describe('acceptCandidateNode locked protection (M4.3)', () => {
    it('refuses accept overwrite when the confirmed node is already locked', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 1)
      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(true)

      const accepted = workbench.model.nodes.find((node) => node.id === 'candidate-observation-1')
      expect(accepted).toBeDefined()
      accepted!.reviewStatus = 'locked'
      const lockedSnapshot = JSON.parse(JSON.stringify(accepted))

      workbench.candidateModel = {
        ...workbench.candidateModel!,
        nodes: [
          {
            id: 'candidate-observation-1',
            type: 'observation',
            text: '试图覆盖锁定节点的新文本',
            sourceAnchorIds: ['anchor-1'],
            confidence: 0.99,
          },
          ...workbench.candidateModel!.nodes.filter((node) => node.id !== 'candidate-observation-1'),
        ],
      }

      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(false)
      expect(
        workbench.model.nodes.find((node) => node.id === 'candidate-observation-1'),
      ).toEqual(lockedSnapshot)
    })

    it('allows accept overwrite again after unlock', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([{ id: 'anchor-1', ...createAnchor({ quote: '候选原文' }) }])
      workbench.generateFixtureCandidate('note-1', 1)
      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(true)

      workbench.selectNode('candidate-observation-1')
      expect(workbench.lockSelectedNode()).toBe(true)
      expect(workbench.unlockSelectedNode()).toBe(true)

      workbench.candidateModel = {
        ...workbench.candidateModel!,
        nodes: [
          {
            id: 'candidate-observation-1',
            type: 'observation',
            text: '解锁后允许覆盖的新文本',
            sourceAnchorIds: ['anchor-1'],
            confidence: 0.88,
          },
          ...workbench.candidateModel!.nodes.filter((node) => node.id !== 'candidate-observation-1'),
        ],
      }

      expect(workbench.acceptCandidateNode('candidate-observation-1').ok).toBe(true)
      expect(workbench.model.nodes.find((node) => node.id === 'candidate-observation-1')).toMatchObject(
        {
          text: '解锁后允许覆盖的新文本',
          reviewStatus: 'confirmed',
        },
      )
    })
  })

  describe('deleteSelectedEdge (#3)', () => {
    it('returns false when no edge is selected', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.deleteSelectedEdge()).toBe(false)
    })

    it('removes only the selected edge and clears selection', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectEdge('edge-evidence-supports-claim')
      const edgeCountBefore = workbench.model.edges.length
      const nodeCountBefore = workbench.model.nodes.length

      expect(workbench.deleteSelectedEdge()).toBe(true)
      expect(workbench.selectedEdgeId).toBeNull()
      expect(workbench.model.edges).toHaveLength(edgeCountBefore - 1)
      expect(workbench.model.edges.some((edge) => edge.id === 'edge-evidence-supports-claim')).toBe(
        false,
      )
      expect(workbench.model.nodes).toHaveLength(nodeCountBefore)
    })
  })

  describe('createConfirmedEdge (M4 correction toolkit)', () => {
    it('returns false when endpoints are missing or identical', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(
        workbench.createConfirmedEdge({
          sourceNodeId: 'missing',
          targetNodeId: 'claim-product-engineer',
          type: 'supports',
        }),
      ).toBe(false)
      expect(
        workbench.createConfirmedEdge({
          sourceNodeId: 'claim-product-engineer',
          targetNodeId: 'claim-product-engineer',
          type: 'supports',
        }),
      ).toBe(false)
    })

    it('appends a user-created confirmed edge and selects it', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const edgeCountBefore = workbench.model.edges.length

      expect(
        workbench.createConfirmedEdge({
          sourceNodeId: 'evidence-shared-workflow',
          targetNodeId: 'action-build-gyrnote',
          type: 'leads_to',
        }),
      ).toBe(true)
      expect(workbench.model.edges).toHaveLength(edgeCountBefore + 1)
      expect(workbench.selectedEdge).toMatchObject({
        sourceNodeId: 'evidence-shared-workflow',
        targetNodeId: 'action-build-gyrnote',
        type: 'leads_to',
        label: null,
        origin: 'user_created',
        explicitness: 'explicit',
        reviewStatus: 'confirmed',
        confidence: null,
      })
    })
  })

  describe('createConfirmedNode (M4 correction toolkit checkpoint)', () => {
    it('returns false when text is blank', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.createConfirmedNode({ type: 'claim', text: '   ' })).toBe(false)
    })

    it('returns false for custom type without a label', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(
        workbench.createConfirmedNode({ type: 'custom', text: '自定义节点', label: '  ' }),
      ).toBe(false)
    })

    it('appends a user-created confirmed node and selects it', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const nodeCountBefore = workbench.model.nodes.length
      const candidateBefore = workbench.candidateModel

      expect(
        workbench.createConfirmedNode({ type: 'observation', text: '  手工补充观察  ' }),
      ).toBe(true)
      expect(workbench.model.nodes).toHaveLength(nodeCountBefore + 1)
      expect(workbench.selectedNode).toMatchObject({
        type: 'observation',
        label: null,
        text: '手工补充观察',
        origin: 'user_created',
        explicitness: 'explicit',
        reviewStatus: 'confirmed',
        confidence: null,
        sourceAnchorIds: [],
      })
      expect(workbench.selectedNodeId).toBe(workbench.selectedNode?.id)
      expect(workbench.candidateModel).toBe(candidateBefore)
    })

    it('stores a trimmed custom label for custom nodes', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(
        workbench.createConfirmedNode({
          type: 'custom',
          text: '一个自定义节点',
          label: '  类比  ',
        }),
      ).toBe(true)
      expect(workbench.selectedNode).toMatchObject({
        type: 'custom',
        label: '类比',
        text: '一个自定义节点',
      })
    })
  })
  describe('acceptCandidateNode materializes proposed anchors (M3.L+)', () => {
    it('copies a proposed anchor into sourceAnchors when accepting a node', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([])
      workbench.candidateModel = {
        id: 'candidate-note-1-1',
        noteId: 'note-1',
        sourceRevision: 1,
        title: 'LLM 候选',
        proposedAnchors: [
          {
            id: 'proposed-1',
            blockId: 'block-intro',
            quote: '原文证据',
            startOffset: 0,
            endOffset: 4,
          },
        ],
        nodes: [
          {
            id: 'candidate-observation-1',
            type: 'observation',
            text: '观察',
            sourceAnchorIds: ['proposed-1'],
            confidence: 0.7,
          },
        ],
        edges: [],
      }
      workbench.candidateStatus = 'ready'

      const result = workbench.acceptCandidateNode('candidate-observation-1')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.materializedAnchor).toBe(true)
      }
      expect(workbench.sourceAnchors).toHaveLength(1)
      expect(workbench.sourceAnchors[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      expect(workbench.sourceAnchors[0]).toMatchObject({
        blockId: 'block-intro',
        startOffset: 0,
        endOffset: 4,
        quote: '原文证据',
        quoteHash: hashSourceQuote('原文证据'),
      })
      expect(workbench.model.nodes.find((node) => node.id === 'candidate-observation-1')).toMatchObject(
        {
          sourceAnchorIds: [workbench.sourceAnchors[0]?.id],
          reviewStatus: 'confirmed',
        },
      )
    })

    it('does not duplicate when the proposed anchor is already local', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([
        {
          id: 'proposed-1',
          ...createAnchor({
            quote: '原文证据',
            blockId: 'block-intro',
            startOffset: 0,
            endOffset: 4,
          }),
        },
      ])
      workbench.candidateModel = {
        id: 'candidate-note-1-1',
        noteId: 'note-1',
        sourceRevision: 1,
        title: 'LLM 候选',
        proposedAnchors: [
          {
            id: 'proposed-1',
            blockId: 'block-intro',
            quote: '原文证据',
            startOffset: 0,
            endOffset: 4,
          },
        ],
        nodes: [
          {
            id: 'candidate-observation-1',
            type: 'observation',
            text: '观察',
            sourceAnchorIds: ['proposed-1'],
            confidence: 0.7,
          },
        ],
        edges: [],
      }

      const result = workbench.acceptCandidateNode('candidate-observation-1')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.materializedAnchor).toBe(false)
      }
      expect(workbench.sourceAnchors).toHaveLength(1)
    })
    it('materializes every proposed anchor cited by the accepted node', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.replaceSourceAnchors([])
      workbench.candidateModel = {
        id: 'candidate-note-1-1',
        noteId: 'note-1',
        sourceRevision: 1,
        title: 'LLM 候选',
        proposedAnchors: [
          {
            id: 'proposed-a',
            blockId: 'block-1',
            quote: '证据甲',
            startOffset: 0,
            endOffset: 3,
          },
          {
            id: 'proposed-b',
            blockId: 'block-2',
            quote: '证据乙',
            startOffset: 0,
            endOffset: 3,
          },
        ],
        nodes: [
          {
            id: 'candidate-claim-1',
            type: 'claim',
            text: '跨段主张',
            sourceAnchorIds: ['proposed-a', 'proposed-b'],
            confidence: 0.7,
          },
        ],
        edges: [],
      }

      const result = workbench.acceptCandidateNode('candidate-claim-1')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.materializedAnchor).toBe(true)
      }
      expect(workbench.sourceAnchors).toHaveLength(2)
      expect(
        workbench.sourceAnchors.every((anchor) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            anchor.id,
          ),
        ),
      ).toBe(true)
      expect(
        workbench.model.nodes.find((node) => node.id === 'candidate-claim-1')?.sourceAnchorIds,
      ).toEqual(workbench.sourceAnchors.map((anchor) => anchor.id))
    })
  })
  describe('graph interactions via Pinia (drag / connect / edge style)', () => {
    it('stores node positions outside ThoughtModel', () => {
      const workbench = useThoughtModelWorkbenchStore()

      expect(workbench.setNodePosition('question-direction', { x: 40, y: 80 })).toBe(true)
      expect(workbench.nodePositions['question-direction']).toEqual({ x: 40, y: 80 })
      expect(workbench.model.nodes.find((node) => node.id === 'question-direction')).not.toHaveProperty(
        'position',
      )
    })

    it('connects two nodes by writing a confirmed edge through createConfirmedEdge', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const edgeCountBefore = workbench.model.edges.length

      expect(workbench.connectNodesOnGraph('question-direction', 'action-build-gyrnote')).toBe(true)
      expect(workbench.model.edges).toHaveLength(edgeCountBefore + 1)
      expect(workbench.selectedEdge).toMatchObject({
        sourceNodeId: 'question-direction',
        targetNodeId: 'action-build-gyrnote',
        type: 'supports',
        origin: 'user_created',
      })
    })

    it('switches edge path style and can reset layout overrides', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.setNodePosition('question-direction', { x: 1, y: 2 })

      expect(workbench.setGraphEdgePathStyle('smoothstep')).toBe(true)
      expect(workbench.graphEdgePathStyle).toBe('smoothstep')
      workbench.resetGraphLayout()
      expect(workbench.nodePositions).toEqual({})
    })

    it('hydrates layout overrides without writing into ThoughtNode', () => {
      const workbench = useThoughtModelWorkbenchStore()

      workbench.replaceGraphLayout({
        nodePositions: {
          'question-direction': { x: 11, y: 22 },
          missing: { x: 0, y: 0 },
        },
        edgePathStyle: 'straight',
      })

      expect(workbench.nodePositions).toEqual({
        'question-direction': { x: 11, y: 22 },
      })
      expect(workbench.graphEdgePathStyle).toBe('straight')
      expect(workbench.model.nodes.find((node) => node.id === 'question-direction')).not.toHaveProperty(
        'position',
      )
    })
  })

  describe('ModelPatch approve path', () => {
    it('loads a fixture patch without mutating confirmed model', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const beforeNodes = workbench.model.nodes.map((node) => node.id)

      expect(workbench.loadFixtureModelPatch()).toBe(true)
      expect(workbench.pendingPatch?.ops.length).toBeGreaterThan(0)
      expect(workbench.model.nodes.map((node) => node.id)).toEqual(beforeNodes)
    })

    it('applies a delete_node patch into confirmed model only after approve', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.pendingPatch = {
        id: 'patch-delete-only',
        noteId: workbench.model.noteId,
        baseModelVersion: workbench.model.version,
        reason: 'test delete',
        ops: [{ op: 'delete_node', nodeId: 'evidence-shared-workflow' }],
      }

      expect(workbench.applyPendingPatch()).toBe(true)
      expect(workbench.pendingPatch).toBeNull()
      expect(workbench.model.nodes.some((node) => node.id === 'evidence-shared-workflow')).toBe(
        false,
      )
    })

    it('does not mutate confirmed model when proposing from anchor statuses', () => {
      const workbench = useThoughtModelWorkbenchStore()
      const before = JSON.parse(JSON.stringify(workbench.model))

      workbench.loadPatchFromAnchorStatuses({ 'missing-anchor': 'invalid' })

      expect(JSON.parse(JSON.stringify(workbench.model))).toEqual(before)
    })

    it('stages delete_node from invalid anchors and writes the model only after approve', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('evidence-shared-workflow')
      workbench.attachSourceAnchorToSelectedNode(createAnchor(), 'anchor-gone')

      const beforeCount = workbench.model.nodes.length
      expect(workbench.loadPatchFromAnchorStatuses({ 'anchor-gone': 'invalid' })).toBe(true)
      expect(workbench.pendingPatch?.id).not.toBe(workbench.model.id)
      expect(workbench.pendingPatch?.ops).toEqual([
        { op: 'delete_node', nodeId: 'evidence-shared-workflow' },
      ])
      expect(workbench.model.nodes).toHaveLength(beforeCount)

      expect(workbench.applyPendingPatch()).toBe(true)
      expect(workbench.pendingPatch).toBeNull()
      expect(workbench.model.nodes.some((node) => node.id === 'evidence-shared-workflow')).toBe(
        false,
      )
    })

    it('does not propose a patch when drifted is reported without new offsets', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('evidence-shared-workflow')
      workbench.attachSourceAnchorToSelectedNode(createAnchor(), 'anchor-drift')

      expect(workbench.loadPatchFromAnchorStatuses({ 'anchor-drift': 'drifted' })).toBe(false)
      expect(workbench.pendingPatch).toBeNull()
      expect(workbench.model.nodes.some((node) => node.id === 'evidence-shared-workflow')).toBe(
        true,
      )
    })

    it('stages move_anchor from drifted resolutions with a new range and writes anchors only after approve', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('evidence-shared-workflow')
      workbench.attachSourceAnchorToSelectedNode(createAnchor({ quote: '原文' }), 'anchor-drift')

      const beforeNodes = workbench.model.nodes.map((node) => node.id)
      expect(
        workbench.loadPatchFromAnchorStatuses({
          'anchor-drift': { status: 'drifted', startOffset: 3, endOffset: 5 },
        }),
      ).toBe(true)
      expect(workbench.pendingPatch?.id).not.toBe(workbench.model.id)
      expect(workbench.pendingPatch?.ops).toEqual([
        { op: 'move_anchor', anchorId: 'anchor-drift', startOffset: 3, endOffset: 5 },
      ])
      expect(workbench.model.nodes.map((node) => node.id)).toEqual(beforeNodes)
      expect(workbench.sourceAnchors[0]).toMatchObject({
        id: 'anchor-drift',
        startOffset: 0,
        endOffset: 2,
      })

      expect(workbench.applyPendingPatch()).toBe(true)
      expect(workbench.pendingPatch).toBeNull()
      expect(workbench.sourceAnchors[0]).toMatchObject({
        id: 'anchor-drift',
        startOffset: 3,
        endOffset: 5,
      })
      expect(workbench.model.nodes.map((node) => node.id)).toEqual(beforeNodes)
    })

    it('applies move_anchor to sourceAnchors only after approve', () => {
      const workbench = useThoughtModelWorkbenchStore()
      workbench.selectNode('evidence-shared-workflow')
      workbench.attachSourceAnchorToSelectedNode(createAnchor(), 'anchor-move')
      workbench.pendingPatch = {
        id: 'patch-move',
        noteId: workbench.model.noteId,
        baseModelVersion: workbench.model.version,
        reason: 'test move',
        ops: [{ op: 'move_anchor', anchorId: 'anchor-move', startOffset: 2, endOffset: 5 }],
      }

      expect(workbench.applyPendingPatch()).toBe(true)
      expect(workbench.sourceAnchors[0]).toMatchObject({
        id: 'anchor-move',
        startOffset: 2,
        endOffset: 5,
      })
      expect(workbench.model.nodes.some((node) => node.id === 'evidence-shared-workflow')).toBe(
        true,
      )
    })
  })
})

function createAnchor(overrides: Partial<SourceAnchor> = {}): SourceAnchor {
  const quote = overrides.quote ?? '原文'

  return {
    blockId: 'block-source',
    startOffset: 0,
    endOffset: quote.length,
    quote,
    quoteHash: hashSourceQuote(quote),
    ...overrides,
  }
}

function getNodeText(
  workbench: ReturnType<typeof useThoughtModelWorkbenchStore>,
  nodeId: string,
): string {
  const node = workbench.model.nodes.find((candidate) => candidate.id === nodeId)

  if (!node) {
    throw new Error(`Missing ThoughtNode: ${nodeId}`)
  }

  return node.text
}

function getEdgeType(
  workbench: ReturnType<typeof useThoughtModelWorkbenchStore>,
  edgeId: string,
): string {
  const edge = workbench.model.edges.find((candidate) => candidate.id === edgeId)

  if (!edge) {
    throw new Error(`Missing ThoughtEdge: ${edgeId}`)
  }

  return edge.type
}
