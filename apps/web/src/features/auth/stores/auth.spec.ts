import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAuthStore } from './auth'

function mockTokenResponse() {
  return {
    ok: true,
    json: async () => ({ access_token: 'access-token-1', token_type: 'bearer' }),
  }
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('logs in with form-urlencoded credentials and keeps the access token in memory', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockTokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()

    await auth.signIn({ username: 'alice', password: 'secret' })

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.accessToken).toBe('access-token-1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.any(URLSearchParams),
      }),
    )
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((request.body as URLSearchParams).toString()).toBe('username=alice&password=secret')
  })

  it('restores an access token from the HttpOnly refresh session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockTokenResponse())
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()

    expect(await auth.ensureSession()).toBe(true)
    expect(auth.accessToken).toBe('access-token-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/refresh', {
      method: 'POST',
      credentials: 'include',
    })
  })

  it('exposes a server error without retaining an invalid session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Wrong username, email or password.' }),
      }),
    )
    const auth = useAuthStore()

    await expect(auth.signIn({ username: 'alice', password: 'wrong' })).rejects.toThrow(
      'Wrong username, email or password.',
    )
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.errorMessage).toBe('Wrong username, email or password.')
  })

  it('clears local state even when the server logout request fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({ ok: false, status: 401 })
    vi.stubGlobal('fetch', fetchMock)
    const auth = useAuthStore()

    await auth.signIn({ username: 'alice', password: 'secret' })
    await auth.signOut()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.accessToken).toBeNull()
  })
})
