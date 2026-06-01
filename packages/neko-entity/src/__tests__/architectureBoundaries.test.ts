import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('neko-entity architecture boundaries', () => {
  it('keeps core and provider modules independent from feature packages and host APIs', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/providers')),
    ];

    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]@neko\/search/,
      /from ['"]@neko\/agent/,
      /from ['"]@neko-agent\//,
      /from ['"]@neko-story\//,
      /from ['"]neko-story/,
      /from ['"]@neko\/asset/,
      /from ['"]@neko-assets/,
      /from ['"]neko-assets/,
      /from ['"]@neko-dashboard/,
      /from ['"]neko-dashboard/,
      /from ['"]react/,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps projection modules independent from Agent, feature implementations, and UI APIs', () => {
    const files = listTypeScriptFiles(resolve(packageRoot, 'src/projections'));

    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]@neko\/agent/,
      /from ['"]@neko-agent\//,
      /from ['"]@neko-story\//,
      /from ['"]neko-story/,
      /from ['"]@neko-assets/,
      /from ['"]neko-assets/,
      /from ['"]@neko-dashboard/,
      /from ['"]neko-dashboard/,
      /from ['"]react/,
      /from ['"][^'"]*webview[^'"]*['"]/i,
      /from ['"][^'"]*extension[^'"]*['"]/i,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps direct file mutation out of Dashboard Webview code', () => {
    const webviewRoot = resolve(packageRoot, '../neko-dashboard/packages/webview/src');
    if (!exists(webviewRoot)) return;

    const violations = listTypeScriptFiles(webviewRoot)
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
          (match) => match[1] ?? '',
        );
        return imports
          .filter((specifier) =>
            /^(node:fs|fs|node:path|path|@neko\/entity\/host-vscode)$/.test(specifier),
          )
          .map((specifier) => `${relative(packageRoot, file)} -> ${specifier}`);
      });

    expect(violations).toEqual([]);
  });
});

function listTypeScriptFiles(dir: string): string[] {
  if (!exists(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
