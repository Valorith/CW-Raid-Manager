import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const openBrowserEnv = process.env.OPEN_BROWSER?.toLowerCase();
const shouldOpenBrowser =
  openBrowserEnv === 'true' || (!openBrowserEnv && !process.env.RAILWAY_STATIC_URL);

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    open: shouldOpenBrowser,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
