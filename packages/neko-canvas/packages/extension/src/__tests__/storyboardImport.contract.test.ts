import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const capabilitySource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');

describe('canvas storyboard import contracts', () => {
  it('exports a storyboard import API on NekoCanvasAPI implementation', () => {
    expect(extensionSource).toContain('storyboard: {');
    expect(extensionSource).toContain(
      'const created = await importStoryboardToCanvas(api, payload, options);',
    );
    expect(extensionSource).toContain('return created;');
  });

  it('registers a public command for storyboard payload import', () => {
    expect(extensionSource).toContain("'neko.canvas.importStoryboard'");
  });

  it('publishes storyboard import write-back events to external subscribers', () => {
    expect(extensionSource).toContain(
      'canvasEditorProvider.reportStoryboardImport(payload, created);',
    );
  });

  it('opens or creates a canvas before importing storyboard payloads', () => {
    expect(extensionSource).toContain('await ensureCanvasEditorForStoryboardImport(payload);');
    expect(extensionSource).toContain('waitForActiveCanvasEditorReady');
    expect(extensionSource).toContain('canvasEditorProvider.hasActiveCanvasEditorReady()');
    expect(extensionSource).toContain('vscode.openWith');
    expect(extensionSource).toContain('CanvasEditorProvider.viewType');
  });

  it('opens or creates a canvas before importing generated assets', () => {
    expect(extensionSource).toContain('await ensureCanvasEditorForAssetImport(asset);');
    expect(extensionSource).toContain(
      'const accepted = await canvasEditorProvider.postImportAsset(asset);',
    );
  });

  it('routes agent storyboard import through the canvas storyboard API', () => {
    expect(capabilitySource).toContain('api.storyboard.import(payload, { startX, startY })');
  });
});
