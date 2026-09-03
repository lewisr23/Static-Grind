import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // host: true binds 0.0.0.0 instead of just localhost, so npm run dev is
  // reachable from a phone on the same Wi-Fi at http://<your-lan-ip>:5173
  server: { port: 5173, host: true },
  // The CPU effects worker optionally dynamic-imports the WASM glue (absent
  // until `npm run build:wasm` has run), which needs code-splitting inside the
  // worker bundle — the default classic 'iife' worker format can't do that.
  worker: { format: 'es' },
})
