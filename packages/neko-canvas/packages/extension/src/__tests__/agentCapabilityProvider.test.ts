import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const providerSource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');

describe('agentCapabilityProvider storyboard export contracts', () => {
  it('syncs shot timeline import metadata after neko-cut import', () => {
    expect(providerSource).toContain('applyCanvasTimelineSyncToCanvas');
    expect(providerSource).toContain(
      "await vscode.commands.executeCommand('neko.cut.importStoryboard'",
    );
    expect(providerSource).toContain('buildStoryboardImportTimelineSyncPayload(');
  });

  it('registers additive composable Canvas Agent tools', () => {
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT');
  });

  it('drives preset schemas from shared registry constants', () => {
    expect(providerSource).toContain('CANVAS_AGENT_NODE_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_DERIVE_TARGET_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_CONTAINER_PRESETS');
    expect(providerSource).not.toContain("'shot',\n                'scene'");
  });
});
