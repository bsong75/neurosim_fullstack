import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, API calls go to the FastAPI backend (docker compose exposes it on 8080)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080' },
  },
})
