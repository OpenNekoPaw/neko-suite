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
    },
    // Dedupe d3 modules to use single version
    dedupe: ['d3', 'd3-array', 'd3-contour', 'd3-shape', 'd3-scale', 'd3-selection', 'd3-transition'],
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
        assistant: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Rename style.css to assistant-style.css to avoid conflicts
          if (assetInfo.name === 'style.css') {
            return 'assets/assistant-style.css';
          }
          return 'assets/[name].[ext]';
        },
        // NOTE: Code splitting disabled for VSCode webview compatibility
        // VSCode webviews have strict resource loading restrictions that
        // prevent dynamic imports from working with hashed chunk names.
        // All code is bundled into a single file instead.
      },
    },
    modulePreload: false,
    commonjsOptions: {
      // Handle mermaid's d3 dependencies
      include: [/node_modules/],
    },
  },
  optimizeDeps: {
    include: [
      '@uniedit/shared',
      'mermaid',
      'd3',
      'd3-array',
      'd3-contour',
    ],
  },
});
