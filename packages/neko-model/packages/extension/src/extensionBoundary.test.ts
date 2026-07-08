import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanNekoProjectAuthoringCoreDependencies } from '@neko/shared';

const srcRoot = resolve(__dirname);
const packageRoot = resolve(srcRoot, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

function readPackageSource(relativePath: string): string {
  return readFileSync(resolve(packageRoot, relativePath), 'utf8');
}

describe('extension platform boundaries', () => {
  it('uses the shared logger registry instead of direct ConsoleLogger instances', () => {
    expect(readSource('logger.ts')).toMatch(/createLoggerRegistry\('NekoModel'\)/);

    for (const file of [
      'editor/ModelDocument.ts',
      'editor/ModelEditorProvider.ts',
      'extension.ts',
    ]) {
      expect(readSource(file), file).not.toMatch(/\bConsoleLogger\b/);
    }
  });

  it('reports user-visible activation command errors through VSCodeErrorHandler', () => {
    const extension = readSource('extension.ts');

    expect(extension).toMatch(/new VSCodeErrorHandler\(logger\.child\('Errors'\)\)/);
    expect(extension).toMatch(/errorHandler\.handleError/);
    expect(extension).not.toMatch(/showErrorMessage\(message\)/);
  });

  it('keeps model asset import on the authoring service instead of queued open-editor paths', () => {
    const extension = readSource('extension.ts');
    const provider = readSource('editor/ModelEditorProvider.ts');
    const packageJson = readPackageSource('package.json');

    expect(extension).toContain('ModelProjectAuthoringService');
    expect(extension).toContain('neko.model.authoring.importAsset');
    expect(extension).not.toContain('neko.model.importAsset');
    expect(packageJson).not.toContain('neko.model.importAsset');
    expect(extension).not.toContain("'.neko', 'temp'");
    expect(extension).not.toContain('openModelProjectWithQueuedImport');
    expect(provider).not.toContain('queuedModelImport');
    expect(provider).not.toContain('queueModelImport(');
  });

  it('keeps model durable authoring free of UI adapter dependencies', () => {
    expect(
      scanNekoProjectAuthoringCoreDependencies(
        readSource('services/ModelProjectAuthoringService.ts'),
      ),
    ).toEqual({
      ok: true,
      diagnostics: [],
    });
  });
});
