import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => ({
  plugins: [react()],
  // Keep identical app base in production and local dev.
  base: '/spendiq/',
  server: { port: 5173 },
}))