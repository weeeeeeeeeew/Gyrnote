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
  const headers = new Headers(options.headers)
  const pinia = getActivePinia()
  const accessToken = pinia ? useAuthStore(pinia).accessToken : null
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    ...options,
    headers,
  })

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
