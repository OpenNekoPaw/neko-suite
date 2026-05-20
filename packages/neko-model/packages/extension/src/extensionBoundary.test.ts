import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(__dirname);

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
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
});
