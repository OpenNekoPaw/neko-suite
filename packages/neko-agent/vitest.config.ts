import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/extension/src/**/*.test.ts',
      'packages/platform/src/**/*.test.ts',
      'packages/ai-sdk/src/**/*.test.ts',
      '../neko-skills/src/**/*.test.ts',
      'packages/agent/src/**/*.test.ts',
      'packages/agent-types/src/**/*.test.ts',
      'packages/cli-tui/src/**/*.test.{ts,tsx}',
      'test-utils/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/packages/webview/**',
      // Extension tests that depend on real vscode module (run via VSCode test runner).
      // Handler and processor tests use vi.mock('vscode') and are included below.
      'packages/extension/src/ai/**/*.test.ts',
      'packages/extension/src/chat/chatProvider.test.ts',
      // Platform task-manager was  and moved to @neko/agent
      'packages/platform/src/task/__test__/**',
      // media-generation-service depends on deprecated task-manager path
      'packages/platform/src/media/__tests__/media-generation-service.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
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
      '@neko/content': path.resolve(__dirname, '../neko-content/src'),
      '@neko/skills': path.resolve(__dirname, '../neko-skills/src'),
      '@neko-agent/types': path.resolve(__dirname, 'packages/agent-types/src'),
      '@neko-agent/test-utils': path.resolve(__dirname, 'test-utils/src'),
      '@neko/neko-client': path.resolve(__dirname, '../neko-client/src'),
      // Handler tests mock vscode via vi.mock('vscode') — alias ensures resolution
      'vscode': path.resolve(__dirname, 'packages/extension/src/__mocks__/vscode.ts'),
    },
  },
});
