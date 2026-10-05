import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow (/duo-bastion/); defaults to / elsewhere.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  server: { port: 5173 },
});
