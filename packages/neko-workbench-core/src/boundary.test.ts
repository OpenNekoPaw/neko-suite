import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenPatterns: readonly RegExp[] = [
  /from ['"]react['"]/,
  /from ['"]react-dom/,
  /from ['"]vscode['"]/,
  /from ['"]electron['"]/,
  /from ['"]node:/,
  /from ['"]fs['"]/,
  /from ['"]path['"]/,
  /from ['"]@neko-agent\//,
  /from ['"]@neko-canvas\//,
  /from ['"]@neko-cut\//,
  /from ['"]@neko-audio\//,
  /from ['"]@neko-model\//,
  /from ['"]@neko-sketch\//,
  /from ['"]@neko\/preview/,
];

describe('Workbench Core boundaries', () => {
  it('keeps production source host-neutral and feature-package neutral', async () => {
    const files = await collectSourceFiles(new URL('.', import.meta.url).pathname);
    const productionFiles = files.filter((file) => !file.endsWith('.test.ts'));

    for (const file of productionFiles) {
      const source = await readFile(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.ts') {
      files.push(absolutePath);
    }
  }
  return files;
}
