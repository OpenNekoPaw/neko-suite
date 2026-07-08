import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(__dirname);
const packageRoot = resolve(srcRoot, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

function readPackageSource(relativePath: string): string {
  return readFileSync(resolve(packageRoot, relativePath), 'utf8');
}

describe('sketch extension authoring boundaries', () => {
  it('does not expose the legacy UI-bound importAsset command', () => {
    const commands = readSource('commands/index.ts');
    const packageJson = readPackageSource('package.json');

    expect(commands).not.toContain('neko.sketch.importAsset');
    expect(packageJson).not.toContain('neko.sketch.importAsset');
    expect(commands).toContain('neko.sketch.authoring.importImageSource');
  });

  it('does not keep queued Webview import or temp-project prerequisites alive', () => {
    const commands = readSource('commands/index.ts');
    const provider = readSource('editor/sketchEditorProvider.ts');

    expect(commands).not.toContain('openSketchWithQueuedFileImport');
    expect(commands).not.toContain("'.neko', 'temp'");
    expect(provider).not.toContain('pendingFileImport');
    expect(provider).not.toContain('queueFileImport');
    expect(provider).not.toContain('clearQueuedFileImport');
    expect(provider).not.toContain('importFileAsset(');
  });

  it('routes Sketch-to-Cut transfer through canonical Cut authoring', () => {
    const commands = readSource('commands/index.ts');

    expect(commands).toContain('neko.cut.authoring.importGeneratedClip');
    expect(commands).not.toContain('neko.cut.importGeneratedClip');
  });
});
