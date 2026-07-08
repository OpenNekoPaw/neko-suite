import { describe, expect, it } from 'vitest';
import { DESKTOP_WORKBENCH_HOST_CAPABILITIES } from './desktop-workbench-adapter';
import {
  createDesktopFeatureWebviewAdapterRegistry,
  createDesktopFeatureWebviewHostAdapters,
} from './feature-webview-adapters';

describe('desktop feature Webview adapter descriptors', () => {
  it('loads package-owned descriptors without runtime handles', () => {
    const adapters = createDesktopFeatureWebviewHostAdapters();

    expect(adapters.map((adapter) => adapter.id)).toEqual([
      'neko.canvas.webview.host-adapter',
      'neko.cut.webview.root',
      'neko.audio.webview.host-adapter',
      'neko.sketch.webview.host-adapter',
      'neko.model.webview.host-adapter',
      'neko.preview.webview.host-adapter',
    ]);
    expect(adapters.map((adapter) => adapter.owner.id)).toEqual([
      '@neko-canvas/webview',
      '@neko/webview',
      '@neko-audio/webview',
      '@neko-sketch/webview',
      '@neko-model/webview',
      '@neko/preview-webview',
    ]);
    expect(adapters.every((adapter) => adapter.owner.id !== 'neko-desktop-bootstrap')).toBe(true);
    expect(JSON.stringify(adapters)).not.toContain('React');
    expect(JSON.stringify(adapters)).not.toContain('vscode.');
    expect(JSON.stringify(adapters)).not.toContain('Electron');
    expect(JSON.stringify(adapters)).not.toContain('engine-token:');
  });

  it('projects package-owned custom editor contributions for Electron Desktop', () => {
    const registry = createDesktopFeatureWebviewAdapterRegistry(DESKTOP_WORKBENCH_HOST_CAPABILITIES);

    expect(registry.snapshot().diagnostics).toEqual([]);
    expect(registry.toCustomEditorContribution('neko.canvas.webview.host-adapter')).toEqual(
      expect.objectContaining({
        id: 'neko.canvas.editor.canvas-workbench',
        kind: 'custom-editor',
        owner: expect.objectContaining({ id: '@neko-canvas/webview' }),
        viewType: 'canvas-workbench',
        runtime: 'package-host-adapter',
      }),
    );
  });
});
