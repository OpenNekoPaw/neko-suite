import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@neko/shared': resolve(__dirname, '../shared/src'),
    },
  },
});
