import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/platform/src/__tests__/real-api-smoke.test.ts',
      'packages/agent/src/__tests__/real-api-agent-workflow.test.ts',
      'packages/cli-tui/src/__tests__/real-api-tui-projection.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/packages/webview/**'],
  },
  resolve: {
    alias: {
      '@neko/shared': path.resolve(__dirname, '../neko-types/src'),
      '@neko/agent': path.resolve(__dirname, 'packages/agent/src'),
      '@neko/platform': path.resolve(__dirname, 'packages/platform/src'),
      '@neko/content': path.resolve(__dirname, '../neko-content/src'),
      '@neko-agent/types': path.resolve(__dirname, 'packages/agent-types/src'),
      '@neko-agent/test-utils': path.resolve(__dirname, 'test-utils/src'),
      '@neko-agent/test-utils/real-api': path.resolve(
        __dirname,
        'test-utils/src/real-api/index.ts',
      ),
      '@neko/neko-client': path.resolve(__dirname, '../neko-client/src'),
      vscode: path.resolve(__dirname, 'packages/extension/src/__mocks__/vscode.ts'),
    },
  },
});
