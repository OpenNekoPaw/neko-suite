import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: true,
  removeNodeProtocol: false,
  target: 'node24',
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
    '@neko/markdown',
    '@neko/market-core',
    '@neko/platform',
    '@neko/search',
    '@neko/shared',
    '@neko/skills',
    'neko-assets',
  ],
  // Keep heavy/optional deps external
  external: ['ink', 'react', 'yoga-wasm-web', 'mermaid', 'ajv', 'bun:sqlite', 'node:sqlite'],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.md': 'text',
    };
  },
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});
