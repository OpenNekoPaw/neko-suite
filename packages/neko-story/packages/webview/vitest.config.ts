import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared': resolve(__dirname, '../../../neko-types/src'),
      '@neko/shared/icons': resolve(__dirname, '../../../neko-types/src/icons/index.ts'),
      '@neko/ui': resolve(__dirname, '../../../neko-ui/src'),
      '@neko/ui/icons': resolve(__dirname, '../../../neko-ui/src/icons/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    coverage: sharedCoverage(),
  },
});
