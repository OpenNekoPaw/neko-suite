import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared': resolve(__dirname, '../../../neko-types/src'),
      '@neko/ui': resolve(__dirname, '../../../neko-ui/src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    coverage: sharedCoverage(),
  },
});
