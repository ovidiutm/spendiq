import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Project Pages path: https://ovidiutm.github.io/spendiq
  base: command === 'build' ? '/spendiq/' : '/',
  server: { port: 5173 },
}))
