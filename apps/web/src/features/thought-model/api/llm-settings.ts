const STORAGE_KEY = 'gyrnote.llm'

export interface LlmLocalSettings {
  apiKey: string
  baseUrl: string
  model: string
  embeddingApiKey: string
  embeddingBaseUrl: string
  embeddingModel: string
}

const emptySettings: LlmLocalSettings = {
  apiKey: '',
  baseUrl: '',
  model: '',
  embeddingApiKey: '',
  embeddingBaseUrl: '',
  embeddingModel: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readLlmLocalSettings(): LlmLocalSettings {
  if (typeof localStorage === 'undefined') {
    return { ...emptySettings }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...emptySettings }
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return { ...emptySettings }
    }
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      embeddingApiKey: typeof parsed.embeddingApiKey === 'string' ? parsed.embeddingApiKey : '',
      embeddingBaseUrl: typeof parsed.embeddingBaseUrl === 'string' ? parsed.embeddingBaseUrl : '',
      embeddingModel: typeof parsed.embeddingModel === 'string' ? parsed.embeddingModel : '',
    }
  } catch {
    return { ...emptySettings }
  }
}

export function writeLlmLocalSettings(settings: LlmLocalSettings): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      apiKey: settings.apiKey.trim(),
      baseUrl: settings.baseUrl.trim(),
      model: settings.model.trim(),
      embeddingApiKey: settings.embeddingApiKey.trim(),
      embeddingBaseUrl: settings.embeddingBaseUrl.trim(),
      embeddingModel: settings.embeddingModel.trim(),
    }),
  )
}

export function clearLlmLocalSettings(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(STORAGE_KEY)
}

export function llmRequestHeaders(): Record<string, string> {
  const settings = readLlmLocalSettings()
  const headers: Record<string, string> = {}
  if (settings.apiKey.trim()) {
    headers['X-Gyrnote-Llm-Key'] = settings.apiKey.trim()
  }
  if (settings.baseUrl.trim()) {
    headers['X-Gyrnote-Llm-Base-Url'] = settings.baseUrl.trim()
  }
  if (settings.model.trim()) {
    headers['X-Gyrnote-Llm-Model'] = settings.model.trim()
  }
  return headers
}

export function embeddingRequestHeaders(): Record<string, string> {
  const settings = readLlmLocalSettings()
  const headers: Record<string, string> = {}
  if (settings.embeddingApiKey.trim()) {
    headers['X-Gyrnote-Embedding-Key'] = settings.embeddingApiKey.trim()
  }
  if (settings.embeddingBaseUrl.trim()) {
    headers['X-Gyrnote-Embedding-Base-Url'] = settings.embeddingBaseUrl.trim()
  }
  if (settings.embeddingModel.trim()) {
    headers['X-Gyrnote-Embedding-Model'] = settings.embeddingModel.trim()
  }
  return headers
}

export function hasLocalLlmKey(): boolean {
  return Boolean(readLlmLocalSettings().apiKey.trim())
}

export function hasLocalEmbeddingKey(): boolean {
  return Boolean(readLlmLocalSettings().embeddingApiKey.trim())
}

export function maskLlmKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length <= 8) {
    return trimmed ? '••••' : '未填写'
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}
