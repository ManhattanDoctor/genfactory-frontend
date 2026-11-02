import { createRequire } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
const require = createRequire(import.meta.url);
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
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
