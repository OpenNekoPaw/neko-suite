import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const capabilitySource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');
const providerSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');

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

  it('allows linked resource asset imports without a runtime path', () => {
    expect(extensionSource).toContain(
      'if (!asset?.path && !asset?.documentResourceRef && !asset?.resourceRef)',
    );
    expect(extensionSource).toContain('missing asset path or resource ref');
  });

  it('routes agent storyboard import through the canvas storyboard API', () => {
    expect(capabilitySource).toContain('api.storyboard.import(payload, { startX, startY })');
  });

  it('keeps storyboard import free of automatic entity subgraph projection', () => {
    const importStart = extensionSource.indexOf('async function importStoryboardToCanvas');
    const importEnd = extensionSource.indexOf(
      'async function ensureCanvasEditorForStoryboardImport',
    );
    const importBody = extensionSource.slice(importStart, importEnd);

    expect(importBody).toContain('return applyStoryboardPayloadToCanvas(api, payload, options);');
    expect(importBody).not.toContain("type: 'entity'");
    expect(importBody).not.toContain("type: 'representation-slot'");
    expect(importBody).not.toContain("type: 'occurrence'");
    expect(importBody).not.toContain("type: 'generated-asset'");
  });

  it('subscribes and backfills candidate confirmations into open storyboard shots', () => {
    expect(providerSource).toContain('subscribeToEntityChangeEvents');
    expect(providerSource).toContain("'neko.entity.getDashboardCreativeEntitySource'");
    expect(providerSource).toContain('readCreativeEntityChangedRefs(event)');
    expect(providerSource).toContain('this.applyEntityCandidateBackfill(changedRefs)');
    expect(providerSource).toContain("message.type === 'entity.confirmCandidate'");
    expect(providerSource).toContain('this.applyEntityCandidateBackfill([');
  });
});
