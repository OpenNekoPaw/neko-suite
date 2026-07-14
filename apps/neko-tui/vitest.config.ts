import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: sharedCoverage({ include: ['src/**/*.ts'] }),
  },
});
