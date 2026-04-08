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
});
