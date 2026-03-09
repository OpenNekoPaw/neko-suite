import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    coverage: sharedCoverage(),
  },
});
