import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  clean: true,
  splitting: true,
  removeNodeProtocol: false,
  target: 'node24',
  outDir: 'dist',
  noExternal: [
    '@neko/cli',
    '@neko-agent/types',
    '@neko/agent',
    '@neko/ai-sdk',
    '@neko/asset',
    '@neko/content',
    '@neko/entity',
    '@neko/host',
    '@neko/markdown',
    '@neko/market-core',
    '@neko/platform',
    '@neko/search',
    '@neko/shared',
    '@neko/skills',
    'neko-assets',
  ],
  external: ['ink', 'react', 'yoga-wasm-web', 'mermaid', 'ajv', 'bun:sqlite', 'node:sqlite'],
  esbuildOptions(options) {
    options.loader = { ...options.loader, '.md': 'text' };
  },
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});
