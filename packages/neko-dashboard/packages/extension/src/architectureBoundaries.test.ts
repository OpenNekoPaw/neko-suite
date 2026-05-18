import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = join(__dirname, '../../../../..');
const dashboardExtensionSrc = join(repoRoot, 'packages/neko-dashboard/packages/extension/src');
const dashboardWebviewSrc = join(repoRoot, 'packages/neko-dashboard/packages/webview/src');

describe('dashboard architecture boundaries', () => {
  it('does not import Story or Assets implementation modules from the extension host', () => {
    const violations = readProductionSources(dashboardExtensionSrc)
      .map((file) => ({
        file,
        imports: [...readFileSync(file, 'utf-8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
          (match) => match[1] ?? '',
        ),
      }))
      .flatMap(({ file, imports }) =>
        imports
          .filter((specifier) =>
            /(?:@neko-story|neko-story|@neko-assets|neko-assets)/.test(specifier),
          )
          .map((specifier) => `${relative(repoRoot, file)} -> ${specifier}`),
      );

    expect(violations).toEqual([]);
  });

  it('keeps Dashboard Webview away from filesystem and cache schema access', () => {
    const violations = readProductionSources(dashboardWebviewSrc)
      .map((file) => {
        const content = readFileSync(file, 'utf-8');
        const imports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
          (match) => match[1] ?? '',
        );
        const forbiddenImports = imports.filter((specifier) =>
          /^(vscode|node:fs|fs|node:path|path)$/.test(specifier),
        );
        const readsCacheSchema =
          content.includes('.neko/.cache') &&
          !relative(repoRoot, file).endsWith('creativeEntityRenderGuards.ts');
        return {
          file,
          violations: [
            ...forbiddenImports.map((specifier) => `import ${specifier}`),
            ...(readsCacheSchema ? ['cache schema reference'] : []),
          ],
        };
      })
      .flatMap(({ file, violations }) =>
        violations.map((violation) => `${relative(repoRoot, file)} -> ${violation}`),
      );

    expect(violations).toEqual([]);
  });
});

function readProductionSources(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...readProductionSources(fullPath));
      continue;
    }
    if (
      fullPath.endsWith('.ts') &&
      !fullPath.endsWith('.test.ts') &&
      !fullPath.endsWith('.test.tsx') &&
      !fullPath.endsWith('vscode-test-double.ts')
    ) {
      files.push(fullPath);
    }
    if (fullPath.endsWith('.tsx') && !fullPath.endsWith('.test.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}
