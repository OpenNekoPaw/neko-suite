import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const panelSource = readFileSync(join(__dirname, '../panels/PreviewPanel.ts'), 'utf-8');

describe('PreviewPanel canvas handoff contracts', () => {
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

  it('prevents stale async preview updates from writing to a closed or newer panel state', () => {
    expect(panelSource).toContain('private updateVersion = 0;');
    expect(panelSource).toContain('const updateVersion = ++this.updateVersion;');
    expect(panelSource).toContain(
      'void this.updateReadinessRows(document, scriptIndex, sceneStates, updateVersion);',
    );
    expect(panelSource).toContain('void this.sendCharacterThumbnails(scriptIndex, updateVersion);');
    expect(panelSource).toContain(
      'private canApplyUpdate(scriptUri: string, updateVersion: number)',
    );
    expect(panelSource).toContain('this.updateVersion === updateVersion');
  });

  it('routes sendToCanvas through storyboard payload import', () => {
    expect(panelSource).toContain('await this.sendSceneToCanvas(scriptIndex, scene);');
    expect(panelSource).toContain('const scopedIndex: NekoStoryScriptIndex = {');
    expect(panelSource).toContain("'neko.canvas.importStoryboard'");
  });

  it('routes table actions through table-scoped Agent and Canvas handoffs', () => {
    expect(panelSource).toContain("type: 'tableAction'");
    expect(panelSource).toContain('void this.handleTableAction(message.action, message.scope);');
    expect(panelSource).toContain(
      "await vscode.commands.executeCommand('neko.story.startVideoCreation', { sceneIds });",
    );
    expect(panelSource).toContain(
      "await this.sendTableToAgent(scriptIndex, sceneIds, 'storyboard-only');",
    );
    expect(panelSource).toContain(
      'const imported = await this.sendScenesToCanvas(scriptIndex, sceneIds);',
    );
    expect(panelSource).toContain('buildStoryTableAgentPayload({');
  });

  it('shows a dedicated warning when no canvas editor is open', () => {
    expect(panelSource).toContain("message.includes('No active canvas editor')");
  });

  it('treats extension-side sceneStates as the review table source of truth', () => {
    expect(panelSource).toContain('private readonly sceneStateStore: StorySceneStateStore;');
    expect(panelSource).toContain('this.sceneStateStore.getSceneStates(');
    expect(panelSource).toContain('this.sceneStateStore.updateSceneState(');
    expect(panelSource).toContain('sceneStates,');
  });

  it('routes generateStoryboard actions through the extension command pipeline', () => {
    expect(panelSource).toContain(
      "await vscode.commands.executeCommand('neko.story.generateStoryboard');",
    );
  });

  it('sends readiness rows while preserving migration payload fields', () => {
    expect(panelSource).toContain('readinessRows?: readonly StorySceneVideoReadiness[];');
    expect(panelSource).toContain('scriptIndex,');
    expect(panelSource).toContain('sceneStates,');
    expect(panelSource).toContain('readinessRows,');
    expect(panelSource).toContain("'characterThumbnails'");
  });

  it('reads Canvas storyboard summaries through the registered command boundary', () => {
    expect(panelSource).toContain("'neko.canvas.getStoryboardExecutionSummary'");
    expect(panelSource).not.toContain('vscode.extensions.getExtension<');
  });

  it('enriches scene and character Agent payloads without changing story-selection type', () => {
    expect(panelSource).toContain("type: 'story-selection'");
    expect(panelSource).toContain('const data: StoryCharacterAgentContextData = {');
    expect(panelSource).toContain('const data: StorySceneAgentContextData = {');
    expect(panelSource).toContain('assetEntityIds: readiness?.assetEntityIds');
    expect(panelSource).toContain('thumbnailRef: readiness?.thumbnailUri');
    expect(panelSource).toContain('readinessStatus: readiness?.status');
    expect(panelSource).toContain('missingInputs');
  });
});
