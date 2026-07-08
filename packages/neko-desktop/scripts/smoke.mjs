import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFileExists,
  buildDesktopBundle,
  desktopBundlePaths,
  distRoot,
  readPackageJson,
  resolveElectronExecutablePath,
} from './runtime-utils.mjs';

const supportedPlatforms = new Set(['darwin', 'linux', 'win32']);

if (!supportedPlatforms.has(process.platform)) {
  throw new Error(`Unsupported desktop platform for MVP smoke check: ${process.platform}`);
}

buildDesktopBundle();

const packageJson = readPackageJson();
if (packageJson.main !== './dist/main/index.cjs') {
  throw new Error(`Desktop package main must point at built main bundle, got ${packageJson.main}`);
}

assertFileExists(desktopBundlePaths.main, 'Electron main bundle');
assertFileExists(desktopBundlePaths.preload, 'Electron preload bundle');
assertFileExists(desktopBundlePaths.rendererHtml, 'Renderer HTML');
assertFileExists(resolveElectronExecutablePath(), 'Electron executable');

const html = readFileSync(desktopBundlePaths.rendererHtml, 'utf8');
for (const assetPath of readRendererAssetPaths(html)) {
  assertFileExists(join(distRoot, 'renderer', assetPath), `Renderer asset ${assetPath}`);
}

process.stdout.write(`Neko Desktop smoke passed on ${process.platform}/${process.arch}\n`);

function readRendererAssetPaths(html) {
  const paths = [];
  const pattern = /\b(?:src|href)="([^"]+)"/gu;
  for (const match of html.matchAll(pattern)) {
    const rawPath = match[1];
    if (rawPath?.startsWith('/assets/')) {
      throw new Error(`Renderer asset path must be relative for file:// launch: ${rawPath}`);
    } else if (rawPath?.startsWith('./assets/')) {
      paths.push(rawPath.slice(2));
    } else if (rawPath?.startsWith('assets/')) {
      paths.push(rawPath);
    }
  }
  if (paths.length === 0) {
    throw new Error('Renderer HTML does not reference built assets.');
  }
  return paths;
}
