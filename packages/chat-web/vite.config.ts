import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // In the framework the SPA is served under /chat/, so built asset URLs need that
  // prefix. Left at '/' for dev, where Vite serves from the root.
  base: process.env.VITE_BASE ?? '/',
  server: {
    // Same-origin in production (nginx routes /chat/api to the backend); the dev
    // proxy mirrors that so the SPA never needs CORS or an absolute backend URL.
    proxy: {
      '/chat/api': 'http://localhost:8090',
    },
  },
});
