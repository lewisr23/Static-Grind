import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // The CPU effects worker optionally dynamic-imports the WASM glue (absent
  // until `npm run build:wasm` has run), which needs code-splitting inside the
  // worker bundle — the default classic 'iife' worker format can't do that.
  worker: { format: 'es' },
})
