import { describe, expect, it } from 'vitest'

import type { IdentifiedSourceAnchor } from '@/features/source-anchors/domain/source-anchor'
import type { ThoughtModel } from '@/features/thought-model/domain/thought-model'

import {
  fromPersistedThoughtModelPayload,
  toNoteVersionCreatePayload,
  toPersistedGraphLayout,
  toPersistedThoughtModelPayload,
} from './note-persistence'

const anchorId = '11111111-1111-4111-8111-111111111111'

function createAnchor(overrides: Partial<IdentifiedSourceAnchor> = {}): IdentifiedSourceAnchor {
  return {
    id: anchorId,
    blockId: 'block-source',
    startOffset: 0,
    endOffset: 2,
    quote: '原文',
    quoteHash: 'fnv1a32-v1:12345678',
    ...overrides,
  }
}

function createThoughtModel(overrides: Partial<ThoughtModel> = {}): ThoughtModel {
  return {
    id: 'model-1',
    noteId: 'note-1',
    version: 1,
    title: '原文锚定',
    nodes: [
      {
        id: 'n1',
        type: 'claim',
        label: null,
        text: '确认主张',
        origin: 'user_created',
        explicitness: 'explicit',
        reviewStatus: 'confirmed',
        confidence: null,
        sourceAnchorIds: [],
      },
    ],
    edges: [],
    ...overrides,
  }
}

describe('toNoteVersionCreatePayload', () => {
  it('maps canonical Tiptap JSON, anchors, and confirmed ThoughtModel to the API contract', () => {
    const payload = toNoteVersionCreatePayload({
      title: '  原文锚定  ',
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: 'block-source' },
            content: [{ type: 'text', text: '原文' }],
          },
        ],
      },
      sourceAnchors: [createAnchor()],
      thoughtModel: createThoughtModel(),
      graphLayout: {
        nodePositions: {
          n1: { x: 40, y: 80 },
          ghost: { x: 1, y: 2 },
        },
        edgePathStyle: 'smoothstep',
      },
      expectedRevision: 3,
    })

    expect(payload).toEqual({
      title: '原文锚定',
      content_json: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: 'block-source' },
            content: [{ type: 'text', text: '原文' }],
          },
        ],
      },
      source_anchors: [
        {
          id: anchorId,
          block_id: 'block-source',
          start_offset: 0,
          end_offset: 2,
          quote: '原文',
          quote_hash: 'fnv1a32-v1:12345678',
        },
      ],
      thought_model: {
        id: 'model-1',
        note_id: 'note-1',
        version: 1,
        title: '原文锚定',
        nodes: [
          {
            id: 'n1',
            type: 'claim',
            label: null,
            text: '确认主张',
            origin: 'user_created',
            explicitness: 'explicit',
            review_status: 'confirmed',
            confidence: null,
            source_anchor_ids: [],
          },
        ],
        edges: [],
      },
      graph_layout: {
        node_positions: {
          n1: { x: 40, y: 80 },
        },
        edge_path_style: 'smoothstep',
      },
      expected_revision: 3,
    })
  })

  it('preserves duplicate logical IDs for the backend business validator', () => {
    const payload = toNoteVersionCreatePayload({
      title: '笔记',
      contentJson: { type: 'doc' },
      sourceAnchors: [createAnchor(), createAnchor({ blockId: 'block-other' })],
      thoughtModel: createThoughtModel({ title: '笔记', nodes: [], edges: [] }),
      graphLayout: { nodePositions: {}, edgePathStyle: 'default' },
      expectedRevision: 1,
    })

    expect(payload.source_anchors).toHaveLength(2)
    expect(payload.source_anchors.map((anchor) => anchor.id)).toEqual([anchorId, anchorId])
  })

  it.each([
    ['blank title', { title: '   ' }],
    ['invalid revision', { expectedRevision: 0 }],
    ['invalid content', { contentJson: { type: 'paragraph' } }],
    ['invalid anchor id', { sourceAnchors: [createAnchor({ id: 'anchor-source' })] }],
  ])('rejects %s before a request is made', (_caseName, override) => {
    expect(() =>
      toNoteVersionCreatePayload({
        title: '笔记',
        contentJson: { type: 'doc' },
        sourceAnchors: [],
        thoughtModel: createThoughtModel({ nodes: [], edges: [] }),
        graphLayout: { nodePositions: {}, edgePathStyle: 'default' },
        expectedRevision: 1,
        ...override,
      }),
    ).toThrow()
  })
})

describe('persisted ThoughtModel mapping', () => {
  it('round-trips camelCase domain model through snake_case payload', () => {
    const model = createThoughtModel({
      edges: [
        {
          id: 'e1',
          sourceNodeId: 'n1',
          targetNodeId: 'n1',
          type: 'supports',
          label: null,
          origin: 'user_created',
          explicitness: 'explicit',
          reviewStatus: 'confirmed',
          confidence: null,
        },
      ],
    })

    expect(fromPersistedThoughtModelPayload(toPersistedThoughtModelPayload(model))).toEqual(model)
  })
})

describe('toPersistedGraphLayout', () => {
  it('keeps only known node ids and drops non-finite coordinates', () => {
    expect(
      toPersistedGraphLayout({
        nodePositions: {
          n1: { x: 10, y: 20 },
          gone: { x: 1, y: 2 },
          bad: { x: Number.NaN, y: 3 },
        },
        edgePathStyle: 'straight',
        knownNodeIds: ['n1', 'bad'],
      }),
    ).toEqual({
      node_positions: {
        n1: { x: 10, y: 20 },
      },
      edge_path_style: 'straight',
    })
  })

  it('passes through edge path style even when positions are empty', () => {
    expect(
      toPersistedGraphLayout({
        nodePositions: {},
        edgePathStyle: 'smoothstep',
        knownNodeIds: [],
      }),
    ).toEqual({
      node_positions: {},
      edge_path_style: 'smoothstep',
    })
  })
})
