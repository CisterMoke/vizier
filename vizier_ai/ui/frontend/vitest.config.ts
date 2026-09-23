import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 30000,
    fileParallelism: false,
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    env: {
      VITE_LLM_API_KEY: 'test-key',
      VITE_LLM_PROVIDER: 'google',
      VITE_LLM_MODEL: 'gemini-2.0-flash'
    },
    server: {
      deps: {
        inline: ['@mantine/core', '@mantine/hooks', '@floating-ui/react', 'react-remove-scroll']
      }
    }
  }
})
