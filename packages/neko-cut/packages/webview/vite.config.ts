import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  return {
  plugins: [
    react(),
    // Copy libav.js WASM files to dist/assets/libav
    // Use absolute path because pnpm hoists dependencies to root node_modules
    viteStaticCopy({
      targets: [
        {
          src: path.resolve(__dirname, '../../../../node_modules/@wcpeter/libav.js-h264-aac-wav/dist/*'),
          dest: 'assets/libav',
        },
      ],
    }),
  ],
  // Use relative paths for VSCode webview compatibility
  base: './',
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@uniedit/shared': path.resolve(__dirname, '../../../neko-types/src'),
      '@uniedit/effects-runtime': path.resolve(__dirname, '../../../neko-server/packages/effects-runtime/src'),
      '@uniedit/effects-core': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src'),
      '@uniedit/effects-core/shaders/common': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/common.wgsl.ts'),
      '@uniedit/effects-core/shaders/colorCorrection': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/colorCorrection.wgsl.ts'),
      '@uniedit/effects-core/shaders/blendModes': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/blendModes.wgsl.ts'),
      '@uniedit/effects-core/shaders/transitions': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/transitions.wgsl.ts'),
      '@uniedit/effects-core/shaders/effects': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/effects.wgsl.ts'),
      '@uniedit/effects-core/shaders': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders'),
      // Alias for static import of libav.js asm.mjs factory (bypasses package exports)
      '@wcpeter/libav.js-h264-aac-wav/dist/libav-6.4.7.1-h264-aac-wav.asm.mjs': path.resolve(
        __dirname,
        '../../../../node_modules/@wcpeter/libav.js-h264-aac-wav/dist/libav-6.4.7.1-h264-aac-wav.asm.mjs'
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Allow CORS for VSCode Webview (vscode-webview:// origin)
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    fs: {
      // 允许通过 workspace 依赖访问 monorepo 内其它包（例如 @uniedit/shared）
      allow: [path.resolve(__dirname, '../../..'), path.resolve(__dirname, '../../../..')],
    },
  },
  worker: {
    // Inline workers as base64 data URLs to avoid cross-origin issues in VSCode WebView
    format: 'es',
    rollupOptions: {
      output: {
        // Use inline format for workers
        entryFileNames: 'assets/[name].js',
      },
    },
    plugins: () => [
      {
        name: 'worker-alias',
        resolveId(source) {
          const aliasMap: Record<string, string> = {
            '@uniedit/effects-core/shaders/common': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/common.wgsl.ts'),
            '@uniedit/effects-core/shaders/colorCorrection': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/colorCorrection.wgsl.ts'),
            '@uniedit/effects-core/shaders/blendModes': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/blendModes.wgsl.ts'),
            '@uniedit/effects-core/shaders/transitions': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/transitions.wgsl.ts'),
            '@uniedit/effects-core/shaders/effects': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/effects.wgsl.ts'),
            '@uniedit/effects-core/shaders': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/shaders/index.ts'),
            '@uniedit/effects-core': path.resolve(__dirname, '../../../neko-server/packages/effects-core/src/index.ts'),
            '@uniedit/effects-runtime': path.resolve(__dirname, '../../../neko-server/packages/effects-runtime/src/index.ts'),
            '@uniedit/shared': path.resolve(__dirname, '../../../neko-types/src/index.ts'),
          };
          if (aliasMap[source]) {
            return aliasMap[source];
          }
          // Handle subpath imports
          for (const [alias, target] of Object.entries(aliasMap)) {
            if (source.startsWith(alias + '/')) {
              const subpath = source.slice(alias.length);
              return target.replace(/\/index\.ts$/, '') + subpath + '.ts';
            }
          }
          return null;
        },
      },
    ],
  },
  build: {
    outDir: 'dist',
    // Disable CSS code splitting to avoid preload issues in VSCode webview
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        propertyPanel: path.resolve(__dirname, 'propertyPanel.html'),
        assetLibrary: path.resolve(__dirname, 'assetLibrary.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
      // Externalize dynamically imported modules that are not available in webview
      // Only apply in build mode, dev mode needs to resolve these for HMR
      external: isBuild ? ['webm-muxer', '@vedit/media-processor-rs'] : [],
    },
    // Disable module preload polyfill which causes issues in VSCode webview
    modulePreload: false,
  },
  // Optimize dependencies to avoid worker issues
  optimizeDeps: {
    include: ['@uniedit/shared'],
    // Exclude optional dependencies that may not be installed
    exclude: ['webm-muxer', '@vedit/media-processor-rs'],
  },
};
});
