import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionSrc = join(process.cwd(), 'packages/neko-market/packages/extension/src');
const webviewSrc = join(process.cwd(), 'packages/neko-market/packages/webview/src');

describe('market architecture guards', () => {
  it('keeps market extension decoupled from creative domain packages and React', () => {
    const source = readSourceFiles(extensionSrc, (file) => !file.endsWith('.test.ts'));

    expect(source).not.toMatch(/from\s+['"](?:@neko\/)?neko-agent/);
    expect(source).not.toMatch(/from\s+['"](?:@neko\/)?neko-cut/);
    expect(source).not.toMatch(/from\s+['"](?:@neko\/)?neko-assets/);
    expect(source).not.toMatch(/from\s+['"](?:@neko\/)?neko-model/);
    expect(source).not.toMatch(/from\s+['"](?:@neko\/)?neko-tools/);
    expect(source).not.toMatch(/from\s+['"]@neko\/neko-client/);
    expect(source).not.toMatch(/from\s+['"]react['"]/);
  });

  it('keeps market webview from importing vscode', () => {
    const source = readSourceFiles(webviewSrc, (file) => !file.endsWith('.test.ts'));

    expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    expect(source).not.toMatch(/require\(['"]vscode['"]\)/);
  });
});

function readSourceFiles(dir: string, include: (file: string) => boolean): string {
  return listFiles(dir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter(include)
    .map((file) => readFileSync(file, 'utf-8'))
    .join('\n');
}

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
