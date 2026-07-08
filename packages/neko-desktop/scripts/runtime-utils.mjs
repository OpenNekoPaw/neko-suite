import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const distRoot = join(packageRoot, 'dist');

export const desktopBundlePaths = Object.freeze({
  main: join(distRoot, 'main', 'index.cjs'),
  preload: join(distRoot, 'preload', 'index.cjs'),
  rendererHtml: join(distRoot, 'renderer', 'index.html'),
});

export function readPackageJson() {
  return readJson(join(packageRoot, 'package.json'));
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function assertFileExists(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

export function runPackageBin(packageName, binName, args) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = readJson(packageJsonPath);
  const binPath = resolvePackageBin(packageJsonPath, packageJson, binName);
  runNodeScript(binPath, args);
}

export function buildDesktopBundle() {
  runPackageBin('esbuild', 'esbuild', [
    'src/main/index.ts',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node20',
    '--external:electron',
    '--outfile=dist/main/index.cjs',
  ]);

  runPackageBin('esbuild', 'esbuild', [
    'src/preload/index.ts',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node20',
    '--external:electron',
    '--outfile=dist/preload/index.cjs',
  ]);

  runPackageBin('vite', 'vite', ['build']);
}

export function runElectron(args) {
  const electronCliPath = require.resolve('electron/cli.js');
  runNodeScript(electronCliPath, args);
}

export function resolveElectronExecutablePath() {
  return require('electron');
}

export function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: packageRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.signal) {
    throw new Error(`Process was terminated by signal ${result.signal}`);
  }
}

function resolvePackageBin(packageJsonPath, packageJson, binName) {
  const bin = packageJson.bin;
  if (typeof bin === 'string') {
    return join(dirname(packageJsonPath), bin);
  }
  const selectedBin = bin?.[binName];
  if (typeof selectedBin !== 'string' || selectedBin.length === 0) {
    throw new Error(`Package ${packageJson.name} does not expose bin ${binName}.`);
  }
  return join(dirname(packageJsonPath), selectedBin);
}
