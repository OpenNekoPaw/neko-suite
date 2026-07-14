import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedCoverage } from '../../vitest.shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared/vscode/extension': resolve(__dirname, '../neko-types/src/vscode/extension'),
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
      '@neko/neko-client': resolve(__dirname, '../neko-client/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.ts'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}', 'packages/extension/src/**/*.{ts,tsx}'],
    }),
  },
});
