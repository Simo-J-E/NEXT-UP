import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'production-content-policy',
      apply: 'build',
      transformIndexHtml() {
        const api = process.env.VITE_API_BASE_URL;
        const origin = api ? new URL(api).origin : '';
        if (api && new URL(api).protocol !== 'https:')
          throw new Error('Production API_BASE_URL must use HTTPS.');
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; connect-src 'self' ${origin}; object-src 'none'; base-uri 'self'; form-action 'self'`,
            },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  ],
  base: process.env.BASE_PATH || '/',
  server: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['terminal.local'],
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
