import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const providerSource = readFileSync(join(__dirname, './AudioProjectProvider.ts'), 'utf-8');

describe('AudioProjectProvider workspace media path contract', () => {
  it('resolves playback, waveform, and mix sources through the shared workspace resolver', () => {
    expect(providerSource).toContain('resolveWorkspaceMediaPath({');
    expect(providerSource).toContain('source: src,');
    expect(providerSource).toContain('this.resolveProjectSourcePath(fromCache, nkaUri)');
    expect(providerSource).toContain(
      'const waveformSource = await this.resolveProjectSourcePath(src, nkaUri);',
    );
    expect(providerSource).toContain(
      'resolved.set(element.src, await this.resolveProjectSourcePath(element.src, nkaUri));',
    );
    expect(providerSource).not.toContain('return path.resolve(projectDir, src);');
  });

  it('contracts saved .nka absolute sources with explicit document/workspace context', () => {
    expect(providerSource).toContain('contractWorkspaceMediaPath(element.src, context)');
    expect(providerSource).toContain("'neko.assets.contractPath'");
    expect(providerSource).toContain('this.createWorkspacePathCommandContext(projectUri, context)');
    expect(providerSource).toContain('createVSCodeWorkspaceMediaPathContext({');
  });

  it('routes .nka host persistence through the shared project file store', () => {
    expect(providerSource).toContain('new ProjectFileStore({');
    expect(providerSource).toContain('createDefaultProjectFormatCodecRegistry()');
    expect(providerSource).toContain('sourcePolicy: nkaSourcePathPolicy');
    expect(providerSource).toContain('this._projectFileStore.save({');
    expect(providerSource).not.toContain(
      "await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'))",
    );
  });
});
