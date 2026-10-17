import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

const content = fileURLToPath(new URL('../functions/trailhead_core/content', import.meta.url));

/** Writes a fingerprint of the release into the service worker. The file must change whenever the app does, because the
 * browser only installs a new worker when the file's bytes differ; that is what triggers "A new version is ready". */
function serviceWorkerBuildId(): Plugin {
  let outDir = 'dist';
  return {
    name: 'forthright-sw-build-id',
    apply: 'build',
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = join(outDir, 'sw.js');
      if (!existsSync(file)) {
        return;
      }
      const hash = createHash('sha256');
      hash.update(readFileSync(join(outDir, 'index.html')));
      readdirSync(join(outDir, 'assets')).sort().forEach((name) => hash.update(name));
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', hash.digest('hex').slice(0, 12)));
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerBuildId()],
  resolve: { alias: { '@content': content } },
  // Badge and rank data is shared with the Python rules engine, one folder up.
  server: { fs: { allow: ['..'] } },
  build: {
    // The Firebase SDK alone is about 550 kB (130 kB gzipped).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendor code changes rarely; separate chunks let browsers keep it cached between releases.
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions', 'firebase/storage'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
