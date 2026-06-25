import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const panelSource = readFileSync(join(__dirname, '../panels/PreviewPanel.ts'), 'utf-8');

describe('PreviewPanel screenplay preview contracts', () => {
  it('guards webview messages after the preview panel is disposed', () => {
    expect(panelSource).toContain('private isDisposed = false;');
    expect(panelSource).toContain(
      'this.panel.onDidDispose(() => this.disposePanelResources(false), null, this.disposables);',
    );
    expect(panelSource).toContain('public postMessage(message: MessageToWebview): boolean');
    expect(panelSource).toContain('if (this.isDisposed) {');
    expect(panelSource).toContain('return false;');
    expect(panelSource).toContain('isWebviewDisposedError(error)');
    expect(panelSource).toContain('this.disposePanelResources(false);');
  });

  it('keeps preview updates synchronous and document-scoped', () => {
    expect(panelSource).toContain('private updateVersion = 0;');
    expect(panelSource).toContain('++this.updateVersion;');
    expect(panelSource).toContain("type: 'update'");
    expect(panelSource).toContain('document: this.resolveAssets(document)');
    expect(panelSource).not.toContain('updateReadinessRows');
    expect(panelSource).not.toContain('sendCharacterThumbnails');
    expect(panelSource).not.toContain('canApplyUpdate');
  });

  it('does not own storyboard table, canvas handoff, or readiness UI actions', () => {
    expect(panelSource).not.toContain("type: 'tableAction'");
    expect(panelSource).not.toContain("type: 'setView'");
    expect(panelSource).not.toContain('sendTableToAgent');
    expect(panelSource).not.toContain('sendSceneToCanvas');
    expect(panelSource).not.toContain("'neko.canvas.importStoryboard'");
    expect(panelSource).not.toContain('readinessRows');
    expect(panelSource).not.toContain('characterThumbnails');
  });

  it('does not route Agent generation from the preview surface', () => {
    expect(panelSource).not.toContain("type: 'story-selection'");
    expect(panelSource).not.toContain("'neko.agent.sendContext'");
    expect(panelSource).not.toContain("'neko.story.generateStoryboard'");
  });

  it('resolves note asset refs through the workspace media path contract', () => {
    expect(panelSource).toContain('resolveWorkspaceMediaPath({');
    expect(panelSource).toContain('createVSCodeWorkspaceMediaPathContext({');
    expect(panelSource).toContain('source: note.assetRef.path');
    expect(panelSource).not.toContain('path.join(docDir, note.assetRef.path)');
  });
});
