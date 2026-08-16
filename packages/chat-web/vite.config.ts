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
      // The identity token is minted by CakePHP, and the session cookie only rides along
      // same-origin — so dev has to borrow the framework's nginx (dev/docker-compose.dev.yml
      // publishes it on 2354) rather than talk to a second origin.
      '/chat/token': 'http://localhost:2354',
    },
  },
});
