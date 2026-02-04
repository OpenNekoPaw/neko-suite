import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@neko-story/parser': path.resolve(__dirname, '../parser/src'),
      '@neko-story/types': path.resolve(__dirname, '../types/src'),
    },
  },
});
