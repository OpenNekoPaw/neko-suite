import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  minify: true,
  target: 'node18',
  outDir: 'dist',
  // Bundle workspace packages since they export raw .ts files
  noExternal: ['@neko/shared', '@neko/agent'],
  // Keep optional/heavy deps external — loaded dynamically if available
  external: ['mermaid', 'ajv'],
});
