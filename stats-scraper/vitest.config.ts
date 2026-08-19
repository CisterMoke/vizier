import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      react: 'preact/compat'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
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
