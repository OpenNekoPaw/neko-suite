import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const panelSource = readFileSync(join(__dirname, '../panels/PreviewPanel.ts'), 'utf-8');

describe('PreviewPanel canvas handoff contracts', () => {
  it('routes sendToCanvas through storyboard payload import', () => {
    expect(panelSource).toContain("await this.sendSceneToCanvas(scriptIndex, scene);");
    expect(panelSource).toContain("createStoryboardPayload(sceneIndex, {");
    expect(panelSource).toContain("'neko.canvas.importStoryboard'");
  });

  it('shows a dedicated warning when no canvas editor is open', () => {
    expect(panelSource).toContain("message.includes('No active canvas editor')");
  });
});
