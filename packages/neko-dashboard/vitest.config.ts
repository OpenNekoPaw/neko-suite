import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@neko/shared/vscode/extension': resolve(__dirname, '../neko-types/src/vscode/extension'),
      '@neko/shared/vscode': resolve(__dirname, '../neko-types/src/vscode'),
      '@neko/shared': resolve(__dirname, '../neko-types/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
  },
});
