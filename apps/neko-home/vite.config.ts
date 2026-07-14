import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@': resolve(appRoot, '../../packages/neko-agent/packages/webview/src'),
      '@neko-agent/types': resolve(appRoot, '../../packages/neko-agent/packages/agent-types/src'),
      '@neko/markdown': resolve(appRoot, '../../packages/neko-markdown/src'),
      '@neko/shared/icons': resolve(appRoot, '../../packages/neko-types/src/icons/index.ts'),
      '@neko/shared/utils': resolve(appRoot, '../../packages/neko-types/src/utils/index.ts'),
      '@neko/shared/vscode': resolve(appRoot, '../../packages/neko-types/src/vscode/index.ts'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: { input: resolve(appRoot, 'index.html') },
  },
});
