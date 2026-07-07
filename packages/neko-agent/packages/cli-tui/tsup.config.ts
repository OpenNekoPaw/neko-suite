import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  dts: false,
  clean: true,
  target: 'node18',
  outDir: 'dist',
  // Bundle workspace packages since they export raw .ts files
  noExternal: [
    '@neko-agent/types',
    '@neko/agent',
    '@neko/ai-sdk',
    '@neko/asset',
    '@neko/content',
    '@neko/entity',
    '@neko/host',
    '@neko/market-core',
    '@neko/platform',
    '@neko/search',
    '@neko/shared',
    '@neko/skills',
    'neko-assets',
  ],
  // Keep heavy/optional deps external
  external: ['ink', 'react', 'yoga-wasm-web', 'mermaid', 'ajv'],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.md': 'text',
    };
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
