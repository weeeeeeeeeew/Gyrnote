import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  AuthenticationError,
  login,
  logout,
  refreshAccessToken,
  type LoginCredentials,
} from '../api/auth-api'

export type AuthStatus = 'unknown' | 'checking' | 'anonymous' | 'authenticated'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const status = ref<AuthStatus>('unknown')
  const errorMessage = ref<string | null>(null)
  const isSubmitting = ref(false)
  const sessionChecked = ref(false)

  const isAuthenticated = computed(() => status.value === 'authenticated' && accessToken.value !== null)

  async function signIn(credentials: LoginCredentials): Promise<void> {
    errorMessage.value = null
    isSubmitting.value = true

    try {
      const token = await login(credentials)
      accessToken.value = token.access_token
      status.value = 'authenticated'
      sessionChecked.value = true
    } catch (error) {
      status.value = 'anonymous'
      errorMessage.value = error instanceof AuthenticationError ? error.message : '登录失败，请稍后重试'
      throw error
    } finally {
      isSubmitting.value = false
    }
  }

  async function ensureSession(): Promise<boolean> {
    if (isAuthenticated.value) {
      return true
    }
    if (sessionChecked.value) {
      return false
    }

    status.value = 'checking'
    errorMessage.value = null

    try {
      const token = await refreshAccessToken()
      accessToken.value = token.access_token
      status.value = 'authenticated'
      return true
    } catch {
      clearSession()
      return false
    } finally {
      sessionChecked.value = true
    }
  }

  async function signOut(): Promise<void> {
    const token = accessToken.value
    clearSession()

    if (!token) {
      return
    }

    try {
      await logout(token)
    } catch {
      // Local logout still succeeds when the access token has already expired.
    }
  }

  function clearSession(): void {
    accessToken.value = null
    status.value = 'anonymous'
    errorMessage.value = null
  }

  return {
    accessToken,
    status,
    errorMessage,
    isSubmitting,
    isAuthenticated,
    signIn,
    ensureSession,
    signOut,
    clearSession,
  }
})
