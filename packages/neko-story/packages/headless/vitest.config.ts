import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
