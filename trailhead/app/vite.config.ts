import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const content = fileURLToPath(new URL('../functions/trailhead_core/content', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@content': content } },
  // Badge and rank data is shared with the Python rules engine, one folder up.
  server: { fs: { allow: ['..'] } },
  build: {
    // The Firebase SDK alone is about 550 kB (130 kB gzipped).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendor code changes rarely; separate chunks let browsers keep it cached between releases.
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
