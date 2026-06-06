/**
 * Bun build script for neko standalone binary
 *
 * Uses a plugin to stub react-devtools-core (ink's optional devtools dependency).
 * Ink only loads devtools.js via dynamic import(), so stubbing is safe.
 *
 * Output: packages/neko-agent/neko
 */
import { readFileSync, renameSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';

const outdir = resolve(import.meta.dir, '../../');
const stubPath = resolve(import.meta.dir, 'src/stubs/react-devtools-core.ts');

const result = await Bun.build({
  entrypoints: ['./src/cli.tsx'],
  outdir,
  target: 'bun',
  compile: true,
  minify: true,
  plugins: [
    {
      name: 'stub-react-devtools-core',
      setup(build) {
        // Stub ink's optional devtools integration (only used in React DevTools workflow)
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: stubPath,
          namespace: 'file',
        }));
      },
    },
    {
      name: 'raw-markdown-imports',
      setup(build) {
        build.onResolve({ filter: /\.md\?raw$/ }, (args) => {
          const markdownPath = args.path.replace(/\?raw$/, '');
          return {
            path: isAbsolute(markdownPath)
              ? markdownPath
              : resolve(args.resolveDir, markdownPath),
            namespace: 'raw-markdown',
          };
        });

        build.onLoad({ filter: /\.md$/, namespace: 'raw-markdown' }, (args) => ({
          contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))};`,
          loader: 'js',
        }));
      },
    },
  ],
});

if (!result.success) {
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

// Bun names the output after the entrypoint file (cli.tsx -> cli); rename it to neko.
const outputPath = result.outputs[0]?.path;
if (outputPath) {
  const finalPath = join(outdir, 'neko');
  renameSync(outputPath, finalPath);
  console.log(`Built: ${finalPath}`);
}
