import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const panelSource = readFileSync(join(__dirname, '../panels/PreviewPanel.ts'), 'utf-8');

describe('PreviewPanel canvas handoff contracts', () => {
  it('routes sendToCanvas through storyboard payload import', () => {
    expect(panelSource).toContain('await this.sendSceneToCanvas(scriptIndex, scene);');
    expect(panelSource).toContain('createStoryboardPayload(sceneIndex, {');
    expect(panelSource).toContain("'neko.canvas.importStoryboard'");
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
