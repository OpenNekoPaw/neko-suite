import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    coverage: sharedCoverage(),
  },
});
