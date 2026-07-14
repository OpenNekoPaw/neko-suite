import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: sharedCoverage({
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        lines: 16,
        branches: 18,
        functions: 26,
        statements: 15,
      },
    }),
  },
});
