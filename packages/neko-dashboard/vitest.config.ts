import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedCoverage } from '../../vitest.shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared/vscode/extension': resolve(__dirname, '../neko-types/src/vscode/extension'),
      '@neko/shared/vscode': resolve(__dirname, '../neko-types/src/vscode'),
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'packages/extension/src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}', 'packages/extension/src/**/*.{ts,tsx}'],
    }),
  },
});
