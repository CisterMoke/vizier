import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic' },
  // Plotly's vendored GL modules reference Node-style `global`; alias it to
  // the identifier globalThis so every reference resolves to the same object.
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // react-plotly.js imports the full plotly bundle; redirect it to our
      // partial bundle with on-demand geo/GL trace modules.
      'plotly.js/dist/plotly': fileURLToPath(new URL('./src/lib/plotly-bundle.ts', import.meta.url)),
    },
  },
})
