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
    expect(providerSource).toContain('contractHostContentMediaPath(');
    expect(providerSource).toContain('resolveHostContentMediaPath(');
    expect(providerSource).toContain('this.createHostContentPathOptions(projectUri, context)');
    expect(providerSource).not.toContain("'neko.assets.contractPath'");
    expect(providerSource).not.toContain("'neko.assets.resolvePath'");
    expect(providerSource).not.toContain('createWorkspacePathCommandContext');
    expect(providerSource).toContain('createVSCodeWorkspaceMediaPathContext({');
    expect(providerSource).toContain("pathVariables: new Map([['PROJECT', documentDir]])");
    expect(providerSource).toContain(
      'owningWorkspaceRoot: context.owningWorkspaceRoot ?? documentDir',
    );
  });

  it('routes imported and tool-added audio sources through the shared add-source acquisition path', () => {
    expect(providerSource).toContain('private async acquireAudioProjectSource(');
    expect(providerSource).toContain('const result = await this.acquireAudioProjectSource(');
    expect(providerSource).toContain(
      'const result = await this.acquireAudioProjectSource(request, document.uri);',
    );
    expect(providerSource).toContain('ingestProjectSourceAddRequest(ingestRequest');
    expect(providerSource).not.toContain('linkAudioSourceForProject(');
  });

  it('routes audio picker acquisition through canonical project:addSource only', () => {
    expect(providerSource).toContain('handleAudioProjectFilePickerSourceAdd(');
    expect(providerSource).toContain('this.createAudioProjectSourceAddRequest(uri, document.uri');
    expect(providerSource).toContain(
      'await this.addAudioProjectSources(selectedRequests, document, panel)',
    );
    expect(providerSource).toContain('handleProjectSourceAddHostRequest(request');
    expect(providerSource).not.toContain('project:importAudio');
    expect(providerSource).not.toContain('project:importAudioResult');
    expect(providerSource).not.toContain('project:dropImportAudio');
  });

  it('routes .nka host persistence through the shared project file store', () => {
    expect(providerSource).toContain('new ProjectFileStore({');
    expect(providerSource).toContain('new ProjectFileSaveSession<AudioProjectData>({');
    expect(providerSource).toContain('createDefaultProjectFormatCodecRegistry()');
    expect(providerSource).toContain('sourcePolicy: nkaSourcePathPolicy');
    expect(providerSource).toContain('this._projectFileSession.save({');
    expect(providerSource).not.toContain(
      "await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'))",
    );
  });
});
