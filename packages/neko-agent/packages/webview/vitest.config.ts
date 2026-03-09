import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { sharedCoverage } from '../../../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: sharedCoverage(),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@neko/shared/vscode': resolve(__dirname, '../../../neko-types/src/vscode'),
      '@neko/shared': resolve(__dirname, '../../../neko-types/src'),
    },
  },
});
