<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  maskLlmKey,
  readLlmLocalSettings,
  writeLlmLocalSettings,
  type LlmLocalSettings,
} from '../api/llm-settings'
import WorkbenchModal from './WorkbenchModal.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const draft = ref<LlmLocalSettings>(readLlmLocalSettings())
const savedChatMask = computed(() => maskLlmKey(readLlmLocalSettings().apiKey))
const savedEmbeddingMask = computed(() => maskLlmKey(readLlmLocalSettings().embeddingApiKey))

watch(
  () => props.open,
  (open) => {
    if (open) {
      draft.value = readLlmLocalSettings()
    }
  },
)

function handleSave() {
  writeLlmLocalSettings(draft.value)
  emit('close')
}

function handleClear() {
  draft.value = {
    apiKey: '',
    baseUrl: '',
    model: '',
    embeddingApiKey: '',
    embeddingBaseUrl: '',
    embeddingModel: '',
  }
  writeLlmLocalSettings(draft.value)
  emit('close')
}
</script>

<template>
  <WorkbenchModal :open="open" title="模型密钥（仅本机）" size="tall" @close="emit('close')">
    <p class="llm-settings__lead">
      存在浏览器 localStorage，请求时通过对应请求头发给 API，不写入仓库
      <code>.env</code>。页面有 XSS 风险时密钥可被读走；不要用生产密钥。聊天：{{ savedChatMask }}
      · 向量：{{ savedEmbeddingMask }}
    </p>
    <fieldset class="llm-settings__group">
      <legend>聊天模型</legend>
      <p class="llm-settings__hint">
        编译候选图、自然语言改图、笔记问答走这组。千问聊天请填
        <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>
        和聊天模型名（不要填 embedding 模型名）。DeepSeek 聊天接口没有 /embeddings。
      </p>
      <label>
        API Key
        <input v-model="draft.apiKey" type="password" autocomplete="off" placeholder="sk-…" />
      </label>
      <label>
        Base URL（可空，默认用服务端配置）
        <input
          v-model="draft.baseUrl"
          type="text"
          autocomplete="off"
          placeholder="https://api.deepseek.com 或千问 compatible-mode/v1"
        />
      </label>
      <label>
        模型名（可空）
        <input v-model="draft.model" type="text" placeholder="deepseek-v4-flash" />
      </label>
    </fieldset>
    <fieldset class="llm-settings__group">
      <legend>向量模型（召回原文）</legend>
      <p class="llm-settings__hint">
        保存笔记建 chunk 索引；「召回原文」会向量化查询句和确认图节点摘要。必须和入库用同一模型/维度。千问不要用
        <code>dashscope.TextEmbedding.call</code> 的 SDK 形态：本服务走 HTTP。国内填模型名
        <code>qwen3.7-text-embedding-flash</code> 后可只填 Key（默认
        <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>）；国际站请改用
        <code>dashscope-intl</code>。不要把聊天 Key 填到这里，除非两套真是同一把。
      </p>
      <label>
        Embedding API Key
        <input
          v-model="draft.embeddingApiKey"
          type="password"
          autocomplete="off"
          placeholder="sk-…"
        />
      </label>
      <label>
        Embedding Base URL（可空；千问模型名已填时可空）
        <input
          v-model="draft.embeddingBaseUrl"
          type="text"
          autocomplete="off"
          placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
        />
      </label>
      <label>
        Embedding 模型名
        <input
          v-model="draft.embeddingModel"
          type="text"
          placeholder="qwen3.7-text-embedding-flash"
        />
      </label>
    </fieldset>
    <div class="llm-settings__actions">
      <button type="button" @click="handleClear">清除</button>
      <button type="button" class="llm-settings__save" @click="handleSave">保存到本机</button>
    </div>
  </WorkbenchModal>
</template>

<style scoped>
.llm-settings__lead,
.llm-settings__hint {
  margin: 0;
  color: var(--gyre-ink);
  font-size: 12px;
  line-height: 1.5;
}

.llm-settings__lead code {
  color: var(--gyre-deep);
  font-weight: 700;
}

.llm-settings__hint {
  color: var(--gyre-deep);
}

.llm-settings__group {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 10px 12px 12px;
  border: 1px solid var(--gyre-line);
  border-radius: 10px;
}

.llm-settings__group legend {
  padding: 0 4px;
  color: var(--gyre-ink);
  font-size: 12px;
  font-weight: 700;
}

label {
  display: grid;
  gap: 4px;
  color: var(--gyre-ink);
  font-size: 12px;
}

input {
  padding: 8px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  background: #ffffff;
}

.llm-settings__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.llm-settings__actions button {
  padding: 6px 10px;
  border: 1px solid var(--gyre-line);
  border-radius: 8px;
  color: var(--gyre-ink);
  font: inherit;
  background: #ffffff;
  cursor: pointer;
}

.llm-settings__save {
  border-color: var(--gyre-line);
  color: var(--gyre-ink);
  background: var(--gyre-mist);
}
</style>
