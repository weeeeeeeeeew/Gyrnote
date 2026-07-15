import { describe, expect, it } from 'vitest'

import { THOUGHT_NODE_TYPES, isThoughtNodeType } from './thought-model'

describe('isThoughtNodeType', () => {
  it.each(THOUGHT_NODE_TYPES)('accepts the supported node type %s', (nodeType) => {
    expect(isThoughtNodeType(nodeType)).toBe(true)
  })

  it.each(['idea', '', 1, null, undefined, {}, ['claim']])(
    'rejects unsupported input: %j',
    (value) => {
      expect(isThoughtNodeType(value)).toBe(false)
    },
  )
})
