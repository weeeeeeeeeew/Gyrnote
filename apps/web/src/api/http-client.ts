import { getActivePinia } from 'pinia'

import { useAuthStore } from '@/features/auth/stores/auth'

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
    message?: string,
  ) {
    super(message || `API Error: ${status}`)
    this.name = 'ApiError'
  }
}

export async function customFetch<T>(url: string, options: RequestInit): Promise<T> {
  let headers: Headers
  try {
    headers = new Headers(options.headers)
  } catch {
    throw new ApiError(
      400,
      null,
      '模型密钥或请求头含非法字符。请检查 API Key / Base URL 是否粘进了换行或中文标点。',
    )
  }
  const pinia = getActivePinia()
  const accessToken = pinia ? useAuthStore(pinia).accessToken : null
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      ...options,
      headers,
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(
        503,
        null,
        '无法连接 API（Failed to fetch）。请确认 uvicorn 在 127.0.0.1:8000 运行，Vite 仍代理 /api，且 Redis/worker 进程还在。',
      )
    }
    throw error
  }

  const text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('gyrnote:unauthorized'))
    }
    throw new ApiError(response.status, data)
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T
}
