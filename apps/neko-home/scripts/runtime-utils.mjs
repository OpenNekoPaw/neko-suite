import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const bundlePaths = Object.freeze({
  main: join(appRoot, 'dist/main/index.cjs'),
  preload: join(appRoot, 'dist/preload/index.cjs'),
  renderer: join(appRoot, 'dist/renderer/index.html'),
});

export function buildHome() {
  runPackageBin('esbuild', 'esbuild', ['src/main/index.ts', '--bundle', '--platform=node', '--format=cjs', '--target=node20', '--external:electron', '--outfile=dist/main/index.cjs']);
  runPackageBin('esbuild', 'esbuild', ['src/preload/index.ts', '--bundle', '--platform=node', '--format=cjs', '--target=node20', '--external:electron', '--outfile=dist/preload/index.cjs']);
  runPackageBin('vite', 'vite', ['build']);
}

export function runElectron() {
  runNode(require.resolve('electron/cli.js'), [appRoot]);
}

export function assertBundle() {
  for (const [name, path] of Object.entries(bundlePaths)) {
    if (!existsSync(path)) throw new Error(`Neko Home ${name} bundle is missing: ${path}`);
  }
  const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== '@neko/app-home') throw new Error('Unexpected Neko Home package identity.');
}

function runPackageBin(packageName, binName, args) {
  const packagePath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];
  if (!bin) throw new Error(`${packageName} does not expose ${binName}.`);
  runNode(resolve(dirname(packagePath), bin), args);
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
