import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  dts: false,
  clean: true,
  target: 'node18',
  outDir: 'dist',
  // Bundle workspace packages since they export raw .ts files
  noExternal: ['@neko/shared', '@neko/agent'],
  // Keep heavy/optional deps external
  external: ['ink', 'react', 'yoga-wasm-web', 'mermaid', 'ajv'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
