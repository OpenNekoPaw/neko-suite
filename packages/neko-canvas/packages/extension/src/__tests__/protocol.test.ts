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
 *   NKV-006: timeline import success round-trips shotIds/projectName/importedAt
 *   NKV-007: canvas ops sidecar persists to .nkc-ops
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
      expect(providerSource).toContain('payload: { type, position, data }');
    });

    it('consumes payload wrapper in webview', () => {
      expect(webviewSource).toContain('const payload = (message.payload as');
      expect(webviewSource).toContain('type: payload.type ??');
      expect(webviewSource).toContain('position: payload.position ??');
      expect(webviewSource).toContain('data: payload.data ?? {}');
    });
  });

  describe('NKV-002: scriptIndexResult scenes field', () => {
    it('sends scenes field on success', () => {
      // After NKV-002 fix: must use "scenes" not "index"
      expect(providerSource).toContain('scenes: index,');
    });

    it('sends scenes: null on error', () => {
      expect(providerSource).toContain('scenes: null,');
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
    it('extension sends timelineImportResult with stable fields', () => {
      expect(providerSource).toContain("type: 'timelineImportResult'");
      expect(providerSource).toContain('shotIds,');
      expect(providerSource).toContain('projectName,');
      expect(providerSource).toContain('importedAt,');
    });

    it('webview consumes timelineImportResult payload', () => {
      expect(webviewSource).toContain("case 'timelineImportResult'");
      expect(webviewSource).toContain(
        'projectName: (message.projectName as string | undefined) ??',
      );
      expect(webviewSource).toContain('importedAt: (message.importedAt as number | undefined) ??');
    });
  });

  describe('NKV-007: operation sidecar path', () => {
    it('persists operation logs beside the canvas document as .nkc-ops', () => {
      expect(providerSource).toContain('documentUri.with({ path: `${documentUri.path}-ops` })');
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
});
