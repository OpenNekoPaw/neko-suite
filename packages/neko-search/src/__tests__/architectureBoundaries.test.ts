import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('neko-search architecture boundaries', () => {
  it('keeps core free of VSCode and feature package imports', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/providers')),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]vscode['"]/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]@neko\/agent/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]@neko-agent\//);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]neko-story/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]neko-assets/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]neko-dashboard/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]react/);
    }
  });

  it('keeps Agent mention projection from parsing cache files directly', () => {
    const source = readFileSync(
      resolve(packageRoot, '../neko-agent/packages/extension/src/services/projectMentionSearch.ts'),
      'utf8',
    );

    expect(source).toContain('PROJECT_SEARCH_QUERY_COMMAND');
    expect(source).not.toContain('resolveStorageLayout');
    expect(source).not.toContain('asset-graph.json');
    expect(source).not.toContain('search-index.json');
    expect(source).not.toContain('media-metadata.json');
  });
});

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}
