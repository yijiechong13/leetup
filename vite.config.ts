import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const proxy = { '/api': 'http://127.0.0.1:8787' }
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
