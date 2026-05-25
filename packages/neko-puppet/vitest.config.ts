import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedCoverage } from '../../vitest.shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
      '@neko/neko-client': resolve(__dirname, '../neko-client/src'),
      '@neko/ui': resolve(__dirname, '../neko-ui/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.ts', 'packages/webview/src/**/*.test.ts'],
    fileParallelism: false,
    coverage: sharedCoverage(),
  },
});
