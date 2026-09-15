import { afterEach, describe, expect, it } from 'vitest'

import {
  clearLlmLocalSettings,
  embeddingRequestHeaders,
  llmRequestHeaders,
  maskLlmKey,
  writeLlmLocalSettings,
} from './llm-settings'

describe('llm-settings', () => {
  afterEach(() => {
    clearLlmLocalSettings()
  })

  it('stores the key locally and exposes it only as a request header', () => {
    writeLlmLocalSettings({
      apiKey: 'sk-test-secret',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      embeddingApiKey: '',
      embeddingBaseUrl: '',
      embeddingModel: '',
    })

    expect(llmRequestHeaders()).toEqual({
      'X-Gyrnote-Llm-Key': 'sk-test-secret',
      'X-Gyrnote-Llm-Base-Url': 'https://api.deepseek.com',
      'X-Gyrnote-Llm-Model': 'deepseek-v4-flash',
    })
    expect(embeddingRequestHeaders()).toEqual({})
    expect(maskLlmKey('sk-test-secret')).toBe('sk-t…cret')
  })

  it('keeps embedding credentials off the chat headers', () => {
    writeLlmLocalSettings({
      apiKey: 'sk-chat',
      baseUrl: '',
      model: '',
      embeddingApiKey: 'sk-embed',
      embeddingBaseUrl: 'https://embed.example/v1',
      embeddingModel: 'text-embedding-3-small',
    })

    expect(llmRequestHeaders()).toEqual({
      'X-Gyrnote-Llm-Key': 'sk-chat',
    })
    expect(embeddingRequestHeaders()).toEqual({
      'X-Gyrnote-Embedding-Key': 'sk-embed',
      'X-Gyrnote-Embedding-Base-Url': 'https://embed.example/v1',
      'X-Gyrnote-Embedding-Model': 'text-embedding-3-small',
    })
  })
})
