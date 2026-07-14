import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');

describe('Neko Home application boundary', () => {
  it('keeps the renderer sandboxed and free of the retired editor shell', () => {
    const rendererFiles = listFiles(resolve(appRoot, 'src/renderer'));
    for (const file of rendererFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(appRoot, file)).not.toMatch(/from ['"](?:electron|node:|vscode)['"]/u);
      expect(source, relative(appRoot, file)).not.toContain('CodeMirror');
      expect(source, relative(appRoot, file)).not.toContain('EditorWorkbenchShell');
      expect(source, relative(appRoot, file)).not.toContain('CreativeEditorAdapterHost');
    }
  });

  it('does not import Desktop or feature-package internals', () => {
    for (const file of listFiles(resolve(appRoot, 'src'))) {
      if (file.endsWith('architecture-boundary.test.ts')) continue;
      const source = readFileSync(file, 'utf8');
      expect(source, relative(appRoot, file)).not.toContain('neko-desktop');
      expect(source, relative(appRoot, file)).not.toMatch(/packages\/(?:neko-canvas|neko-cut|neko-audio|neko-model)\/.*\/src/u);
    }
  });
});

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return listFiles(path);
    return /\.(?:ts|tsx)$/u.test(path) ? [path] : [];
  });
}
