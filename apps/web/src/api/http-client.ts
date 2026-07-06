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
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
  })

  const text = await response.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    throw new ApiError(response.status, data)
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T
}
