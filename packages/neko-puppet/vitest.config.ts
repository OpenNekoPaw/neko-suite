import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.ts', 'packages/webview/src/**/*.test.ts'],
    fileParallelism: false,
    coverage: sharedCoverage(),
  },
});
