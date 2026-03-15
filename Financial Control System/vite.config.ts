import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        configure: (proxy) => {
          // Reencaminhar TODOS os headers do browser para o Django (incl. Cookie) — evita que o proxy omita o Cookie
          proxy.on('proxyReq', (proxyReq, req) => {
            const headers = req.headers || {};
            for (const [key, value] of Object.entries(headers)) {
              if (value !== undefined && value !== null && key.toLowerCase() !== 'host') {
                proxyReq.setHeader(key, Array.isArray(value) ? value.join(', ') : String(value));
              }
            }
            // Garantir Host para o backend (Django pode validar)
            proxyReq.setHeader('Host', '127.0.0.1:8000');
            if (process.env.DEBUG_PROXY) {
              const hasCookie = !!(headers.cookie || (headers as Record<string, string>).Cookie);
              console.log('[proxy /api]', req.url, 'Cookie reenviado:', hasCookie);
            }
          });
          // Garantir que Set-Cookie da resposta fique para localhost (browser guarda e envia em auth/me, etc.)
          proxy.on('proxyRes', (proxyRes) => {
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              const rewritten = (Array.isArray(setCookie) ? setCookie : [setCookie]).map((c: string) =>
                c.replace(/;\s*Domain=[^;]+/gi, '').replace(/;\s*Secure/gi, '')
              );
              proxyRes.headers['set-cookie'] = rewritten;
            }
          });
        },
      },
      '/assets': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
