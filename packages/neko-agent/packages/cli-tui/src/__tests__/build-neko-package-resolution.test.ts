import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findInstalledPackageRoot,
  findUnambiguousPnpmPackageRoot,
} from '../standalone-package-resolution';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('standalone package resolution', () => {
  it('uses the dependency linked for the importer instead of another pnpm-store version', () => {
    const fixture = createFixture();
    const importer = createPnpmPackage(fixture.store, 'example-importer', '1.0.0');
    const commander12 = createPnpmPackage(fixture.store, 'commander', '12.1.0');
    createPnpmPackage(fixture.store, 'commander', '8.3.0');
    createPnpmPackage(fixture.store, 'commander', '4.1.1');
    linkPackage(commander12, resolve(dirname(importer), 'commander'));
    linkPackage(importer, resolve(fixture.packageRoot, 'node_modules/example-importer'));
    const importerSource = resolve(fixture.packageRoot, 'node_modules/example-importer/index.js');
    writeFileSync(importerSource, 'export {};');

    const resolved = findInstalledPackageRoot('commander', dirname(importerSource));

    expect(readPackageVersion(resolved)).toBe('12.1.0');
  });

  it('fails visibly when a root-store fallback has multiple candidates', () => {
    const fixture = createFixture();
    createPnpmPackage(fixture.store, 'commander', '12.1.0');
    createPnpmPackage(fixture.store, 'commander', '8.3.0');

    expect(() => findUnambiguousPnpmPackageRoot('commander', fixture.store)).toThrow(
      /Ambiguous pnpm package resolution for "commander"/,
    );
  });
});

function createFixture(): { readonly packageRoot: string; readonly store: string } {
  const root = mkdtempSync(resolve(tmpdir(), 'neko-build-resolution-'));
  temporaryDirectories.push(root);
  const packageRoot = resolve(root, 'packages/cli');
  const store = resolve(root, 'node_modules/.pnpm');
  mkdirSync(resolve(packageRoot, 'src'), { recursive: true });
  mkdirSync(resolve(packageRoot, 'node_modules'), { recursive: true });
  mkdirSync(store, { recursive: true });
  return { packageRoot, store };
}

function createPnpmPackage(store: string, packageName: string, version: string): string {
  const packageRoot = resolve(store, `${packageName}@${version}`, 'node_modules', packageName);
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    resolve(packageRoot, 'package.json'),
    JSON.stringify({ name: packageName, version }),
  );
  return packageRoot;
}

function linkPackage(packageRoot: string, linkPath: string): void {
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(packageRoot, linkPath, 'dir');
}

function readPackageVersion(packageRoot: string | undefined): string | undefined {
  if (!packageRoot) return undefined;
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    readonly version?: string;
  };
  return packageJson.version;
}
