import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { realpathSync } from 'fs';

// Force all zustand imports to resolve to local v4 copy (which has default export).
// Root node_modules has zustand v5 (used by other packages), but @react-three/fiber v8
// requires `import create from 'zustand'` (default import) only available in v4.
const localZustandDir = path.resolve(__dirname, 'node_modules/zustand');

// Resolve the real physical path of three.js (pnpm uses symlinks).
const threePath = realpathSync(path.resolve(__dirname, 'node_modules/three'));

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
    dedupe: ['three'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@neko/shared', replacement: path.resolve(__dirname, '../../../neko-types/src') },
      {
        find: '@neko/neko-client',
        replacement: path.resolve(__dirname, '../../../neko-client/src'),
      },
      { find: 'three', replacement: threePath },
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
