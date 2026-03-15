import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path para quando o Django servir o app em /app/
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  server: {
    port: 5173,
    proxy: {
      // Em desenvolvimento, redireciona chamadas à API do Django
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
