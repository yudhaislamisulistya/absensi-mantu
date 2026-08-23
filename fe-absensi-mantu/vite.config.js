import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8108',
    },
  },
  build: {
    // Model pengenalan wajah dimuat lazy hanya saat kamera digunakan.
    chunkSizeWarningLimit: 1400,
  },
})
