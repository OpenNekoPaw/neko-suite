import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Extension tests require vscode mock — run via webview sub-package or VSCode test runner
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/extension/**'],
    coverage: sharedCoverage(),
  },
});
