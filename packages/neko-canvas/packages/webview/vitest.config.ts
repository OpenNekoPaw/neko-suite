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
      '@': path.resolve(__dirname, 'src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
    },
  },
});
