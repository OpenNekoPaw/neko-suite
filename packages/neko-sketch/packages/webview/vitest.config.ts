import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Coverage disabled: Vitest v4 + jsdom triggers ENOENT race on coverage/.tmp in CI
    coverage: { enabled: false },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
    },
  },
});
