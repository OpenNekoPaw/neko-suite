import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');

describe('desktop runtime scripts', () => {
  it('uses platform-neutral Node launchers for desktop build, start, and smoke', () => {
    const desktopPackage = readPackageManifest(resolve(packageRoot, 'package.json'));
    const rootPackage = readPackageManifest(resolve(repoRoot, 'package.json'));

    expect(desktopPackage.scripts.build).toBe('node scripts/build.mjs');
    expect(desktopPackage.scripts.start).toBe('node scripts/start.mjs');
    expect(desktopPackage.scripts.smoke).toBe('node scripts/smoke.mjs');
    expect(rootPackage.scripts['start:desktop']).toBe('pnpm --filter neko-desktop run start');
    expect(rootPackage.scripts['smoke:desktop']).toBe('pnpm --filter neko-desktop run smoke');

    expect(desktopPackage.scripts.build).not.toContain('&&');
    expect(desktopPackage.scripts.start).not.toContain('&&');
    expect(desktopPackage.scripts.smoke).not.toContain('&&');
  });

  it('keeps renderer assets relative for Electron file launch', () => {
    const viteConfig = readFileSync(resolve(packageRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("base: './'");
  });
});

interface PackageManifest {
  readonly scripts: Readonly<Record<string, string>>;
}

function readPackageManifest(filePath: string): PackageManifest {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`Package manifest must be an object: ${filePath}`);
  }
  const scripts = parsed['scripts'];
  if (!isStringRecord(scripts)) {
    throw new Error(`Package manifest scripts must be a string map: ${filePath}`);
  }
  return { scripts };
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
