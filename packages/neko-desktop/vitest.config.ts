import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko-agent/webview/workbench-surfaces': resolve(
        __dirname,
        '../neko-agent/packages/webview/src/workbench-surfaces.ts',
      ),
      '@neko-audio/webview/workbench-adapter': resolve(
        __dirname,
        '../neko-audio/packages/webview/src/workbench-adapter.ts',
      ),
      '@neko-canvas/webview/workbench-adapter': resolve(
        __dirname,
        '../neko-canvas/packages/webview/src/workbench-adapter.ts',
      ),
      '@neko-model/webview/workbench-adapter': resolve(
        __dirname,
        '../neko-model/packages/webview/src/workbench-adapter.ts',
      ),
      '@neko-sketch/webview/workbench-adapter': resolve(
        __dirname,
        '../neko-sketch/packages/webview/src/workbench-adapter.ts',
      ),
      '@neko/preview-webview/workbench-adapter': resolve(
        __dirname,
        '../neko-preview/packages/webview/src/workbench-adapter.ts',
      ),
      '@neko/webview/workbench-adapter': resolve(
        __dirname,
        '../neko-cut/packages/webview/src/workbench-adapter.ts',
      ),
      '@neko/workbench-core': resolve(__dirname, '../neko-workbench-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
