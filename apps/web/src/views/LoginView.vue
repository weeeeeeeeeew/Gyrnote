<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')

async function submit() {
  try {
    await auth.signIn({ username: username.value.trim(), password: password.value })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect.startsWith('/') ? redirect : '/')
  } catch {
    // The store owns the user-facing error message.
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <p class="eyebrow">Gyrnote · 个人知识库</p>
      <h1 id="login-title">登录你的工作台</h1>
      <p class="intro">登录后，笔记和原文锚点会按账号隔离保存。首次本地演示请先按仓库 README 注册账号。</p>

      <form class="login-form" @submit.prevent="submit">
        <label>
          用户名或邮箱
          <input
            v-model="username"
            autocomplete="username"
            name="username"
            required
            autofocus
          />
        </label>

        <label>
          密码
          <input v-model="password" autocomplete="current-password" name="password" required type="password" />
        </label>

        <p v-if="auth.errorMessage" class="form-error" role="alert">{{ auth.errorMessage }}</p>

        <button :disabled="auth.isSubmitting" type="submit">
          {{ auth.isSubmitting ? '登录中…' : '登录' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: #f3f0e8;
}

.login-card {
  width: min(100%, 430px);
  padding: 40px;
  border: 1px solid #d8d6cb;
  border-radius: 20px;
  background: #fffdf8;
  box-shadow: 0 18px 50px rgb(43 48 38 / 10%);
}

.eyebrow {
  color: #687064;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin-top: 12px;
  color: #20251f;
  font-size: 32px;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.intro {
  margin-top: 10px;
  color: #687064;
}

.login-form {
  display: grid;
  gap: 18px;
  margin-top: 28px;
}

label {
  display: grid;
  gap: 7px;
  color: #384238;
  font-weight: 600;
}

input {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #c9c8bd;
  border-radius: 10px;
  color: #20251f;
  font: inherit;
  background: #ffffff;
}

input:focus {
  border-color: #6f8c6c;
  outline: 3px solid rgb(111 140 108 / 18%);
}

button {
  padding: 12px 16px;
  border: 0;
  border-radius: 10px;
  color: #ffffff;
  font: inherit;
  font-weight: 700;
  background: #38523a;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.form-error {
  margin: -4px 0;
  color: #a23d35;
  font-size: 14px;
}

@media (max-width: 480px) {
  .login-card {
    padding: 28px 22px;
  }
}
</style>
