import path from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Force a full page reload on any change under src/ (canvas game; HMR is unreliable). */
function fullReloadOnSrcChange(): Plugin {
  return {
    name: 'full-reload-on-src-change',
    handleHotUpdate({ file, server }) {
      const normalized = file.replace(/\\/g, '/');
      if (!normalized.includes('/src/')) return;
      server.ws.send({ type: 'full-reload', path: file });
      return [];
    },
  };
}

// Project Pages: https://omegarusdev.github.io/caribbean-sim/
// Local / preview keep root base.
const pagesBase = process.env.GITHUB_PAGES === 'true' ? '/caribbean-sim/' : '/'

export default defineConfig({
  base: pagesBase,
  plugins: [fullReloadOnSrcChange()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5300,
    strictPort: true,
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    },
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
