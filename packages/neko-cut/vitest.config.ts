import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/webview/src/**/*.test.ts',
      // Protocol integration tests (self-contained vi.mock('vscode'))
      'packages/extension/src/__tests__/protocol.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: sharedCoverage(),
  },
});
