import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/extension/src/**/*.test.ts',
      'packages/platform/src/**/*.test.ts',
      'packages/agent/src/**/*.test.ts',
      'packages/cli/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/packages/webview/**',
      // Extension tests require vscode module (run via VSCode extension test runner)
      'packages/extension/src/**/*.test.ts',
      // Platform task-manager was deprecated and moved to @neko/agent
      'packages/platform/src/task/__test__/**',
      // media-generation-service depends on deprecated task-manager path
      'packages/platform/src/media/__tests__/media-generation-service.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/packages/webview/**',
        '**/*.test.ts',
        '**/types.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@neko/shared': path.resolve(__dirname, '../neko-types/src'),
      '@neko/agent': path.resolve(__dirname, 'packages/agent/src'),
      '@neko/platform': path.resolve(__dirname, 'packages/platform/src'),
    },
  },
});
