import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@neko/ui': path.resolve(__dirname, '../../../neko-ui/src'),
    },
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
        marketplace: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'assets/marketplace-style.css';
          }
          return 'assets/[name].[ext]';
        },
        // NOTE: Code splitting disabled for VSCode webview compatibility
      },
    },
    modulePreload: false,
  },
  optimizeDeps: {
    include: ['@neko/shared', '@neko/ui'],
  },
});
