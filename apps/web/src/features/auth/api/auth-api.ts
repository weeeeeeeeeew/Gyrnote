export interface LoginCredentials {
  username: string
  password: string
}

export interface AccessTokenResponse {
  access_token: string
  token_type: string
}

export class AuthenticationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export async function login(credentials: LoginCredentials): Promise<AccessTokenResponse> {
  const body = new URLSearchParams({
    username: credentials.username,
    password: credentials.password,
  })

  return requestToken('/api/v1/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

export function refreshAccessToken(): Promise<AccessTokenResponse> {
  return requestToken('/api/v1/refresh', { method: 'POST' })
}

export async function logout(accessToken: string): Promise<void> {
  const response = await fetch('/api/v1/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new AuthenticationError(response.status, '退出登录失败')
  }
}

async function requestToken(path: string, options: RequestInit): Promise<AccessTokenResponse> {
  const response = await fetch(path, { ...options, credentials: 'include' })
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new AuthenticationError(response.status, extractErrorMessage(data))
  }

  if (!isAccessTokenResponse(data)) {
    throw new AuthenticationError(500, '登录响应格式无效')
  }

  return data
}

function isAccessTokenResponse(value: unknown): value is AccessTokenResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const data = value as Record<string, unknown>
  return typeof data.access_token === 'string' && typeof data.token_type === 'string'
}

function extractErrorMessage(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'detail' in value) {
    const detail = (value as { detail: unknown }).detail
    if (typeof detail === 'string') {
      return detail
    }
  }

  return '认证请求失败，请稍后重试'
}
