import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import LoginView from '@/views/LoginView.vue'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: '/notes/:noteId',
      name: 'note',
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const authenticated = await auth.ensureSession()

  if (to.name === 'login' && authenticated) {
    return { name: 'home' }
  }
  if (to.meta.requiresAuth && !authenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  return true
})

if (typeof window !== 'undefined') {
  window.addEventListener('gyrnote:unauthorized', () => {
    const auth = useAuthStore()
    auth.clearSession()
    if (router.currentRoute.value.name !== 'login') {
      void router.replace({ name: 'login' })
    }
  })
}

export default router
