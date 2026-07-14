import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(appRoot, '../../packages/neko-agent/packages/webview/src'),
      '@neko-agent/types': resolve(appRoot, '../../packages/neko-agent/packages/agent-types/src'),
      '@neko/markdown': resolve(appRoot, '../../packages/neko-markdown/src'),
      '@neko/shared/utils': resolve(appRoot, '../../packages/neko-types/src/utils/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: sharedCoverage({ include: ['src/**/*.{ts,tsx}'] }),
  },
});
