import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    preserveSymlinks: true,
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@neko/shared', replacement: path.resolve(__dirname, '../../../neko-types/src') },
      {
        find: '@neko/neko-client',
        replacement: path.resolve(__dirname, '../../../neko-client/src'),
      },
      // R3F v8 does `import create from 'zustand'` (default import),
      // but zustand v4.4+ only exports named. This shim bridges the gap.
      // Exact match only — zustand/middleware etc. resolve normally.
      {
        find: /^zustand$/,
        replacement: path.resolve(__dirname, './src/zustand-compat.ts'),
      },
    ],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')],
    },
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0] === 'style.css') {
            return 'assets/index.css';
          }
          return 'assets/[name].[ext]';
        },
      },
    },
    modulePreload: false,
  },
  optimizeDeps: {
    include: ['@neko/shared'],
  },
});
