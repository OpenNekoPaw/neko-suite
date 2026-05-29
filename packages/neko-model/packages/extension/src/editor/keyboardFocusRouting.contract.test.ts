import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const providerSource = readFileSync(join(__dirname, 'ModelEditorProvider.ts'), 'utf-8');
const appSource = readFileSync(join(__dirname, '../../../webview/src/App.tsx'), 'utf-8');
const typesSource = readFileSync(join(__dirname, '../../../webview/src/types/index.ts'), 'utf-8');
const packageManifestSource = readFileSync(join(__dirname, '../../../../package.json'), 'utf-8');

describe('Model keyboard focus routing contracts', () => {
  it('removes Model editor-internal keybindings while keeping explicit commands', () => {
    const manifest = JSON.parse(packageManifestSource) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        keybindings?: Array<{ command?: string; key?: string; mac?: string }>;
      };
    };
    const commandIds = new Set(
      (manifest.contributes?.commands ?? []).map((command) => command.command),
    );

    expect(manifest.contributes?.keybindings ?? []).toEqual([]);
    for (const commandId of [
      'neko.model.deleteSelected',
      'neko.model.escape',
      'neko.model.selectAll',
      'neko.model.undo',
      'neko.model.redo',
      'neko.model.resetView',
    ]) {
      expect(commandIds.has(commandId)).toBe(true);
    }
  });

  it('reports editable ownership from the Model webview to the focused registry and global context', () => {
    expect(appSource).toContain('useReportWebviewKeyboardEditable({ postMessage })');
    expect(typesSource).toContain("{ type: 'webviewKeyboardEditable'; editable: boolean }");
    expect(providerSource).toContain("case 'webviewKeyboardEditable':");
    expect(providerSource).toContain('this.focusedWebviews.markKeyboardEditable(');
    expect(providerSource).toContain('updateWebviewKeyboardEditableOwner');
    expect(providerSource).toContain('void this.setGlobalKeyboardEditable(panelId, false)');
  });

  it('guards extension-host keyboard command forwarding with the global editable owner', () => {
    expect(providerSource).toContain('MODEL_EDITOR_LEVEL_KEYBOARD_ACTIONS');
    expect(providerSource).toContain('hasWebviewKeyboardEditableOwner');
    expect(providerSource).toContain('await this.hasGlobalKeyboardEditableOwner()');
  });

  it('handles Model local editing shortcuts in the webview root dispatcher', () => {
    expect(appSource).toContain('useModelKeyboardController({');
    expect(appSource).toContain("scope: 'editor'");
    expect(appSource).toContain("scope: 'viewport'");
    expect(appSource).toContain("scope: 'property-panel'");
    expect(appSource).toContain("scope: 'timeline'");
  });
});
