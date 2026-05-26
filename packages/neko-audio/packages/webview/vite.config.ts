import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neko/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@neko/neko-client': path.resolve(__dirname, '../../../neko-client/src'),
      '@neko/ui': path.resolve(__dirname, '../../../neko-ui/src'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5175,
    },
    fs: {
      allow: [
        path.resolve(__dirname, '../../..'),
        path.resolve(__dirname, '../../../..'),
      ],
    },
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        editor: path.resolve(__dirname, 'editor.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    modulePreload: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@neko/ui'],
  },
});
