import { defineConfig } from 'vitest/config';
import path from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage(),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
