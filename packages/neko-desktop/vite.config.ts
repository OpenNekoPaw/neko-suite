import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@': resolve(packageRoot, '../neko-agent/packages/webview/src'),
      '@neko-agent/types': resolve(packageRoot, '../neko-agent/packages/agent-types/src'),
      '@neko/markdown': resolve(packageRoot, '../neko-markdown/src'),
      '@neko/shared/icons': resolve(packageRoot, '../neko-types/src/icons/index.ts'),
      '@neko/shared/utils': resolve(packageRoot, '../neko-types/src/utils/index.ts'),
      '@neko/shared/vscode': resolve(packageRoot, '../neko-types/src/vscode/index.ts'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(packageRoot, 'index.html'),
    },
  },
});
