import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/extension/src/**/*.test.ts',
      'packages/platform/src/**/*.test.ts',
      'packages/shared/src/**/*.test.ts',
      'packages/agent/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/packages/webview/**'],
    setupFiles: [
      'packages/extension/src/test/setup.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/packages/webview/**',
        '**/*.test.ts',
        '**/types.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/extension/src'),
      'vscode': path.resolve(__dirname, 'packages/extension/src/test/vscodeMock.ts'),
      '@uniedit/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@uniedit/agent': path.resolve(__dirname, 'packages/agent/src'),
    }
  }
});
