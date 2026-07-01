import { defineConfig } from 'vitest/config';
import path from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage(),
  },
  resolve: {
    alias: {
      '@neko-story/headless': path.resolve(__dirname, '../headless/src'),
      '@neko-story/parser': path.resolve(__dirname, '../parser/src'),
      '@neko-story/types': path.resolve(__dirname, '../types/src'),
    },
  },
});
