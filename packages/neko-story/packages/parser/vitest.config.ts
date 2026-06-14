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
      '@neko-story/types': path.resolve(__dirname, '../types/src'),
    },
  },
});
