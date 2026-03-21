import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/avwx': {
        target: 'https://aviationweather.gov/api/data',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/avwx/, ''),
      },
    },
  },
})
