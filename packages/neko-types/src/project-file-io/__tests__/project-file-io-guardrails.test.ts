import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = findRepoRoot(__dirname);

describe('project file I/O guardrails', () => {
  it('keeps migrated nk* editor persistence on the shared project file store', () => {
    const migratedFiles = [
      'packages/neko-puppet/packages/extension/src/editor/puppetEditorProvider.ts',
      'packages/neko-model/packages/extension/src/editor/ModelDocument.ts',
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
      'packages/neko-audio/packages/extension/src/providers/AudioProjectProvider.ts',
      'packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts',
      'packages/neko-cut/packages/extension/src/services/ProjectSessionService.ts',
    ];

    for (const file of migratedFiles) {
      expect(readSource(file), file).toContain('ProjectFileStore');
      expect(readSource(file), file).toContain('createDefaultProjectFormatCodecRegistry');
    }
  });

  it('prevents migrated editor paths from reintroducing direct nk* JSON persistence', () => {
    const forbiddenByFile: Record<string, readonly RegExp[]> = {
      'packages/neko-puppet/packages/extension/src/editor/puppetEditorProvider.ts': [
        /JSON\.parse\(json\)\s+as\s+NkpProjectData/,
        /workspace\.fs\.writeFile\(document\.uri,\s*Buffer\.from\(json/,
      ],
      'packages/neko-model/packages/extension/src/editor/ModelDocument.ts': [
        /JSON\.parse\(text\)\s+as\s+NkmProjectData/,
        /workspace\.fs\.writeFile\(this\.uri/,
        /workspace\.fs\.writeFile\(targetUri/,
      ],
      'packages/neko-model/packages/extension/src/editor/ModelEditorProvider.ts': [
        /JSON\.parse\(new TextDecoder\(\)\.decode\(nkmData\)\)/,
        /JSON\.stringify\(project,\s*null,\s*2\)/,
      ],
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts': [
        /content\.trim\(\)\s*\?\s*loadNkc\(content\)/,
        /workspace\.fs\.writeFile\(targetUri,\s*Buffer\.from\(content/,
      ],
      'packages/neko-audio/packages/extension/src/providers/AudioProjectProvider.ts': [
        /const raw = await vscode\.workspace\.fs\.readFile\(nkaUri\)/,
        /loadNka\(Buffer\.from\(raw\)\.toString/,
        /workspace\.fs\.writeFile\(document\.uri,\s*Buffer\.from\(content/,
      ],
      'packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts': [
        /JSON\.parse\(content\)\s+as\s+NksDocument/,
        /JSON\.stringify\(data,\s*null,\s*2\)/,
        /workspace\.fs\.writeFile\(document\.uri,\s*Buffer\.from\(content/,
      ],
    };

    for (const [file, patterns] of Object.entries(forbiddenByFile)) {
      const source = readSource(file);
      for (const pattern of patterns) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to locate repo root from ${startDir}`);
}
