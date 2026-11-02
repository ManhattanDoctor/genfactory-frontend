import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
const require = createRequire(import.meta.url);
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildId = randomUUID();
  return {
    define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
    plugins: [
      react(),
      {
        name: 'genfactory-update-worker',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'genfactory-sw.js',
            source: `
const VERSION = ${JSON.stringify(buildId)};
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'GENFACTORY_ACTIVATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'GENFACTORY_VERSION') event.source?.postMessage({type:'GENFACTORY_VERSION', version:VERSION});
});
// Deliberately no fetch handler or CacheStorage: requests always use the network.
`,
          });
        },
      },
    ],
    resolve: { alias: { util: require.resolve('util/') } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/socket.io': {
          target: env.GNOSIS_API_TARGET || 'http://127.0.0.1:3015',
          ws: true,
          changeOrigin: true,
        },
        '/api': {
          target: env.GNOSIS_API_TARGET || 'http://127.0.0.1:3015',
          changeOrigin: true,
          timeout: 1_200_000,
          proxyTimeout: 1_200_000,
        },
      },
    },
    build: { sourcemap: false },
  };
});
