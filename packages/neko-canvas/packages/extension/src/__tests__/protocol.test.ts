/**
 * Protocol source contract tests for neko-canvas extension.
 *
 * Verifies that canvasEditorProvider.ts uses the correct DTO field names
 * in cross-boundary messages. If someone changes a field name, this test fails.
 *
 * Tested contracts (post-fix):
 *   NKV-001: nodes.list uses nodeType (not bare "type")
 *   NKV-001B: nodes.update uses data field
 *   NKV-001C: nodes.create uses payload { type, position, data }
 *   NKV-002: scriptIndexResult uses scenes (not "index")
 *   NKV-003: modelInstalledResult uses installedVersion (not "installed")
 *   NKV-004: webview consumes the same nodes.update / nodes.create DTO
 *   NKV-005: operation bridge uses shared VSCode gateway
 *   NKV-006: timeline import success round-trips through timelineSync
 *   NKV-007: toolbar can pick .nkc files into canvas-embed nodes
 *   NKV-008: toolbar pickers cover file-bound reference nodes
 *   NKV-009: composable Agent node operations use payload wrappers
 *   NKV-010: projected Canvas write-back routes through projection adapters
 *   NKV-012: canvas toolbar export intent routes through a whitelisted command
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the production source file for contract verification
const providerSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');
const webviewSource = readFileSync(
  join(__dirname, '../../../webview/src/hooks/useVSCodeMessages.ts'),
  'utf-8',
);
const canvasAppSource = readFileSync(
  join(__dirname, '../../../webview/src/CanvasApp.tsx'),
  'utf-8',
);
const operationStoreSource = readFileSync(
  join(__dirname, '../../../webview/src/stores/canvasOperationStore.ts'),
  'utf-8',
);

describe('canvasEditorProvider message contracts', () => {
  describe('NKV-001: nodes.list nodeType parameter', () => {
    it('sends nodeType field, not bare type', () => {
      // After NKV-001 fix: the provider must send nodeType: type
      expect(providerSource).toContain('nodeType: type');
    });
  });

  describe('NKV-001B: nodes.update data parameter', () => {
    it('sends data field from extension', () => {
      expect(providerSource).toContain("sendRequest('nodes.update', { nodeId, data })");
    });

    it('consumes data field in webview', () => {
      expect(webviewSource).toContain('message.data as Record<string, unknown>');
    });
  });

  describe('NKV-001C: nodes.create payload contract', () => {
    it('sends payload wrapper from extension', () => {
      expect(providerSource).toContain('payload: { type, position, data, preset }');
    });

    it('consumes payload wrapper in webview', () => {
      expect(webviewSource).toContain('const payload = (message.payload as');
      expect(webviewSource).toContain("const type = payload.type ?? 'annotation'");
      expect(webviewSource).toContain('type,');
      expect(webviewSource).toContain('position: payload.position ??');
      expect(webviewSource).toContain('data: payload.data ?? {}');
      expect(webviewSource).toContain('preset: payload.preset');
    });
  });

  describe('NKV-002: scriptIndexResult scenes field', () => {
    it('maps script index scenes into canvas ScriptScene payloads', () => {
      expect(providerSource).toContain('scenes: mapStoryScriptIndexToCanvasScenes(index),');
    });

    it('sends scenes: null on error', () => {
      expect(providerSource).toContain('scenes: null,');
    });

    it('resolves the contracted script path before querying neko-story', () => {
      expect(providerSource).toContain(
        'const resolvedScriptPath = await this.resolveAssetPath(scriptPath, document.uri);',
      );
    });

    it('uses NekoStoryAPI instead of a non-existent command bridge', () => {
      expect(providerSource).toContain(
        "vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story')",
      );
      expect(providerSource).toContain(
        'const index = storyApi.getScriptIndex(resolvedScriptPath);',
      );
      expect(providerSource).not.toContain("'neko.story.getScriptIndex'");
    });

    it('does not use bare index as field name in scriptIndexResult', () => {
      // Ensure no regression: the response object should not have { index: index }
      const lines = providerSource.split('\n');
      const scriptIndexLines = lines.filter(
        (l) => l.includes('scriptIndexResult') || l.includes('index: index'),
      );
      const hasOldPattern = scriptIndexLines.some((l) => /\bindex: index\b/.test(l));
      expect(hasOldPattern).toBe(false);
    });
  });

  describe('NKV-003: modelInstalledResult installedVersion field', () => {
    it('sends installedVersion field', () => {
      // After NKV-003 fix: must use "installedVersion" not "installed"
      expect(providerSource).toContain('installedVersion:');
    });

    it('does not use bare installed as field name', () => {
      // The old pattern "installed: installed" should not appear
      const lines = providerSource.split('\n');
      const badPattern = lines.some((l) => /^\s+installed:\s+installed/.test(l));
      expect(badPattern).toBe(false);
    });
  });

  describe('NKV-005: operation bridge gateway', () => {
    it('uses shared VSCode gateway helper', () => {
      expect(operationStoreSource).toContain(
        "import { getGlobalVSCodeApi } from '../utils/vscode';",
      );
      expect(operationStoreSource).toContain('const vscode = getGlobalVSCodeApi();');
    });

    it('does not directly read window.__vscode_api__', () => {
      expect(operationStoreSource).not.toContain('__vscode_api__');
    });
  });

  describe('NKV-006: timeline import round-trip', () => {
    it('extension sends shared timelineSync payload with minimal backflow fields', () => {
      expect(providerSource).toContain("type: 'timelineSync'");
      expect(providerSource).toContain('buildStoryboardImportTimelineSyncPayload(');
      expect(providerSource).toContain('payload,');
    });

    it('webview consumes timelineSync payload', () => {
      expect(webviewSource).toContain("case 'timelineSync'");
      expect(webviewSource).toContain(
        'onTimelineSyncRef.current?.(message.payload as CanvasTimelineSyncPayload)',
      );
    });
  });

  describe('NKV-007: canvas embed picker', () => {
    it('extension handles pickCanvasDocument and returns a canvas dropped asset', () => {
      expect(providerSource).toContain("case 'pickCanvasDocument'");
      expect(providerSource).toContain("kind: 'canvas'");
      expect(providerSource).toContain("type: 'dropAssets'");
    });
  });

  describe('NKV-008: reference picker entrypoints', () => {
    it('extension handles script/document/model picker messages', () => {
      expect(providerSource).toContain("case 'pickMediaFile'");
      expect(providerSource).toContain("case 'pickScriptDocument'");
      expect(providerSource).toContain("case 'pickReferenceDocument'");
      expect(providerSource).toContain("case 'pickModelReference'");
      expect(providerSource).toContain("case 'pickProjectDocument'");
      expect(providerSource).toContain("kind: 'media'");
      expect(providerSource).toContain("kind: 'script'");
      expect(providerSource).toContain("kind: 'document'");
      expect(providerSource).toContain("kind: 'model'");
      expect(providerSource).toContain("kind: 'project'");
    });
  });

  describe('NKV-009: Agent composite operation contracts', () => {
    it('waits for canvas data readiness before Agent composite operations', () => {
      expect(providerSource).toContain("case 'canvasDataReady'");
      expect(providerSource).toContain('canvasDataReadyDocumentUris.add(documentUri)');
      expect(providerSource).toContain('hasActiveCanvasEditorReady()');
      expect(webviewSource).toContain("vscode.postMessage({ type: 'canvasDataReady' })");
    });

    it('extension sends new node operation payload wrappers', () => {
      expect(providerSource).toContain("sendRequest<CanvasDeriveNodeResult>('nodes.derive'");
      expect(providerSource).toContain('sendRequest<CanvasCreateConnectionResult>');
      expect(providerSource).toContain("'nodes.createConnection'");
      expect(providerSource).toContain(
        "sendRequest<CanvasCreateCompositeResult>('nodes.createComposite'",
      );
      expect(providerSource).toContain("sendRequest<CanvasUpdateBlockResult>('nodes.updateBlock'");
      expect(providerSource).toContain('sendRequest<CanvasExtractStructuredContentResult>');
      expect(providerSource).toContain("'nodes.extractStructuredContent'");
      expect(providerSource).toContain('payload: request');
    });

    it('webview consumes new node operation requests', () => {
      expect(webviewSource).toContain("case 'nodes.derive'");
      expect(webviewSource).toContain("case 'nodes.createConnection'");
      expect(webviewSource).toContain("case 'nodes.createComposite'");
      expect(webviewSource).toContain("case 'nodes.updateBlock'");
      expect(webviewSource).toContain("case 'nodes.extractStructuredContent'");
      expect(webviewSource).toContain("withOperationSource('ai'");
    });

    it('sendRequest rejects typed errors returned by the webview', () => {
      expect(providerSource).toContain("typeof (value as { error?: unknown }).error === 'string'");
      expect(providerSource).toContain('reject(new Error((value as { error: string }).error));');
    });

    it('validates registered node types before cross-boundary Agent operations', () => {
      expect(providerSource).toContain('assertCanvasNodeType(type)');
      expect(providerSource).toContain('assertCanvasNodeType(request.targetType)');
      expect(providerSource).toContain('assertCanvasNodeType(request.containerType)');
      expect(providerSource).toContain('assertCanvasNodeType(child.type)');
      expect(webviewSource).toContain('isCanvasNodeType(typeFilter)');
      expect(webviewSource).toContain('isCanvasNodeType(type)');
    });
  });

  describe('NKV-010: projected Canvas contracts', () => {
    it('exposes projection adapter registration and write-back through the extension API', () => {
      const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
      expect(extensionSource).toContain('projections: {');
      expect(extensionSource).toContain('registerProjectionAdapter(adapter)');
      expect(extensionSource).toContain('openProjectedCanvas(source)');
      expect(extensionSource).toContain('writeProjectionBack(source, changes)');
    });

    it('routes projected write-back requests through the provider instead of mutating JSON in webview', () => {
      expect(providerSource).toContain("case 'projection.writeBack'");
      expect(providerSource).toContain('this.writeProjectionBack(source, changes)');
      expect(providerSource).toContain('adapter.writeBack(changes)');
      expect(providerSource).toContain(
        "webviewPanel.webview.postMessage({ type: '_response', _requestId: requestId, result })",
      );
      expect(providerSource).toContain(
        'error: error instanceof Error ? error.message : String(error)',
      );
      expect(canvasAppSource).toContain("type: 'projection.writeBack'");
    });

    it('reports projected regeneration failures back to the webview as projection status', () => {
      expect(providerSource).toContain('tryRegenerateProjectedCanvas(');
      expect(providerSource).toContain('adapter.project()');
      expect(providerSource).toContain("type: 'projectionStatus'");
      expect(providerSource).toContain("state: 'writeback-error'");
    });

    it('saves projected canvas layout to cache path rather than the source document', () => {
      expect(providerSource).toContain('this.getProjectionCacheUri(');
      expect(providerSource).toContain('const projectedCanvas = data as unknown as CanvasData');
      expect(providerSource).toContain('isProjectedCanvasData(projectedCanvas)');
      expect(providerSource).toContain("'.neko', '.cache'");
    });
  });

  describe('NKV-011: subsystem status contracts', () => {
    it('guards malformed webview subsystem status before status-bar summary use', () => {
      expect(providerSource).toContain('!Array.isArray(reportedStatus)');
      expect(providerSource).toContain(
        'Array.isArray((reportedStatus as { activeSubsystems?: unknown }).activeSubsystems)',
      );
      expect(providerSource).toContain(
        "filter((item): item is string => typeof item === 'string')",
      );
    });
  });

  describe('NKV-012: canvas toolbar export and package intents', () => {
    it('routes toolbar export and package actions through separate whitelisted paths', () => {
      expect(providerSource).toContain("case 'canvasAction'");
      expect(providerSource).toContain("message.action === 'openExport'");
      expect(providerSource).toContain(
        "vscode.commands.executeCommand('neko.neko-canvas.slashCommand.export')",
      );
      expect(providerSource).toContain("message.action === 'openPackage'");
      expect(providerSource).toContain('createProjectSnapshotPackage({');
      expect(providerSource).toContain("packageId: 'neko-canvas'");
    });

    it('sends lightweight canvasAction intents from the webview toolbar', () => {
      expect(canvasAppSource).toContain("type: 'canvasAction'");
      expect(canvasAppSource).toContain("reportAction('openExport', t('toolbar.export'))");
      expect(canvasAppSource).toContain(
        "reportAction('openPackage', t('toolbar.package'), undefined, canvasData)",
      );
      expect(canvasAppSource).not.toContain("type: 'exportStoryboard'");
      expect(canvasAppSource).not.toContain("type: 'packageCanvas'");
    });
  });

  describe('NKV-013: document resource preview variants', () => {
    it('projects document resource refs directly instead of routing them through preview engine variants', () => {
      expect(providerSource).toContain('const documentResourceRef = isDocumentArchiveResourceRef');
      expect(providerSource).toContain("'neko-canvas.document-resource-variant'");
      expect(providerSource).toContain('if (documentResourceRef) {');
      expect(providerSource).toContain("type: 'preview:variantResolved'");

      const documentResourceBranch = providerSource.slice(
        providerSource.indexOf('if (documentResourceRef) {'),
        providerSource.indexOf('const variantApi = await this.getPreviewVariantApi();'),
      );
      expect(documentResourceBranch).toContain('this.projectLocalResource(');
      expect(documentResourceBranch).not.toContain('registerPreviewAsset');
    });
  });

  describe('source file existence', () => {
    it('canvasEditorProvider.ts is non-empty', () => {
      expect(providerSource.length).toBeGreaterThan(100);
    });

    it('exports CanvasEditorProvider class', () => {
      expect(providerSource).toContain('export class CanvasEditorProvider');
    });
  });

  describe('Layout status migration', () => {
    it('projects subsystem and projection status to the native status bar', () => {
      const statusSource = readFileSync(join(__dirname, '../views/canvasStatusBar.ts'), 'utf-8');

      expect(providerSource).toContain('readCanvasProjectionSummary(canvasData)');
      expect(providerSource).toContain('projectionSummary,');
      expect(canvasAppSource).toContain('projectionStatus,');
      expect(statusSource).toContain('neko.canvas.context');
      expect(statusSource).toContain('contextParts.join');
    });

    it('removes lower-left Canvas surface status overlays', () => {
      expect(canvasAppSource).not.toContain('absolute left-3 bottom-3');
      expect(canvasAppSource).not.toContain('absolute left-3 bottom-10');
      expect(canvasAppSource).not.toContain('formatProjectionStatus(');
    });
  });
});
