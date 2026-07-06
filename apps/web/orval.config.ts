import { defineConfig } from 'orval'

export default defineConfig({
  gyrnoteApi: {
    input: {
      target: 'http://127.0.0.1:8000/openapi.json',
      filters: {
        tags: ['health'],
      },
    },
    output: {
      mode: 'single',
      target: './src/generated/health-api.ts',
      client: 'vue-query',
      httpClient: 'fetch',
      clean: true,
      formatter: 'prettier',
      override: {
        mutator: {
          path: './src/api/http-client.ts',
          name: 'customFetch',
        },
      },
    },
  },
})