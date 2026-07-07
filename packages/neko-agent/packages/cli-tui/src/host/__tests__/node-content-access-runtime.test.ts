import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const runtimeSourcePath = path.resolve(
  __dirname,
  '..',
  'node-content-access-runtime.ts',
);
const packageJsonPath = path.resolve(__dirname, '..', '..', '..', 'package.json');

describe('node content access runtime packaging', () => {
  it('declares EPUB and archive readers as TUI runtime dependencies', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      readonly dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toMatchObject({
      'adm-zip': expect.any(String),
      epub2: expect.any(String),
    });
  });

  it('uses packager-visible imports for optional document readers', () => {
    const source = fs.readFileSync(runtimeSourcePath, 'utf8');

    expect(source).toContain("from 'epub2'");
    expect(source).toContain("from 'adm-zip'");
    expect(source).not.toContain('import(packageName)');
  });
});
