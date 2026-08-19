import { defineConfig, loadEnv } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [preact(), tailwindcss()],
    resolve: {
      alias: {
        react: 'preact/compat',
        'react-dom/test-utils': 'preact/test-utils',
        'react-dom': 'preact/compat',
      },
    },
    define: {
      'import.meta.env.VITE_LLM_API_KEY': JSON.stringify(env.VITE_LLM_API_KEY || ''),
      'import.meta.env.VITE_LLM_PROVIDER': JSON.stringify(env.VITE_LLM_PROVIDER || 'google'),
      'import.meta.env.VITE_LLM_MODEL': JSON.stringify(env.VITE_LLM_MODEL || 'gemini-2.0-flash'),
    },
  }
})
