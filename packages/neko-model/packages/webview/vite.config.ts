import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Force all zustand imports to resolve to the webview package's v4 copy.
// Root node_modules may host a different major version for other packages.
const localZustandDir = path.resolve(__dirname, 'node_modules/zustand');

/**
 * Vite plugin to redirect all zustand imports to local v4 copy.
 * Cannot use simple alias because we need to handle both `zustand`
 * and `zustand/middleware`, `zustand/vanilla`, etc.
 */
function zustandLocalResolvePlugin(): Plugin {
  return {
    name: 'zustand-local-resolve',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'zustand' || source.startsWith('zustand/')) {
        const subpath = source === 'zustand' ? '' : source.slice('zustand'.length);
        return this.resolve(path.join(localZustandDir, subpath), undefined, {
          skipSelf: true,
        });
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), zustandLocalResolvePlugin()],
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
