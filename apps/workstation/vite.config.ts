import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@archeon/scene-engine': fileURLToPath(new URL('../../packages/scene-engine/src/index.ts', import.meta.url)),
      '@archeon/spatial-grammar': fileURLToPath(new URL('../../packages/spatial-grammar/src/index.ts', import.meta.url)),
      '@archeon/design-protocol': fileURLToPath(new URL('../../packages/design-protocol/src/index.ts', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:8799'
    }
  }
});
