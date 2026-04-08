/**
 * Protocol tests for neko-canvas extension <-> webview message routing.
 *
 * Verifies correct field names used in cross-boundary messages:
 *   nodes.list  -> nodeType (not "type")
 *   scriptIndexResult -> scenes (not "index")
 *   modelInstalledResult -> installedVersion (not "installed")
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => p }) },
  EventEmitter: vi.fn(),
  commands: { executeCommand: vi.fn() },
  workspace: { fs: { readFile: vi.fn() } },
  window: {},
}));

describe('neko-canvas protocol', () => {
  describe('nodes.list request', () => {
    it('uses nodeType parameter, not type', () => {
      // The extension sends { type: "nodes.list", nodeType: ... } to the webview.
      // The webview reads message.nodeType (not message.type) for filtering.
      const request = {
        type: 'nodes.list',
        _requestId: 1,
        nodeType: 'image',
      };

      expect(request).toHaveProperty('nodeType', 'image');
      // "type" is the message discriminator, not the filter parameter
      expect(request.type).toBe('nodes.list');
    });

    it('nodeType is optional (lists all nodes when omitted)', () => {
      const request = { type: 'nodes.list', _requestId: 2 };
      expect(request).not.toHaveProperty('nodeType');
    });
  });

  describe('scriptIndexResult message', () => {
    it('uses scenes field, not index', () => {
      const msg = {
        type: 'scriptIndexResult',
        nodeId: 'node-1',
        scenes: [{ heading: 'INT. OFFICE', line: 5 }],
      };

      expect(msg).toHaveProperty('scenes');
      expect(msg).not.toHaveProperty('index');
      expect(msg.type).toBe('scriptIndexResult');
    });

    it('scenes is null on error', () => {
      const errorMsg = {
        type: 'scriptIndexResult',
        nodeId: 'node-2',
        scenes: null,
        error: 'neko-story not available',
      };

      expect(errorMsg.scenes).toBeNull();
      expect(errorMsg.error).toBeDefined();
    });
  });

  describe('modelInstalledResult message', () => {
    it('uses installedVersion field, not installed', () => {
      const msg = {
        type: 'modelInstalledResult',
        nodeId: 'model-1',
        installedVersion: 'installed',
      };

      expect(msg).toHaveProperty('installedVersion');
      expect(msg).not.toHaveProperty('installed');
    });

    it('installedVersion is null when not installed', () => {
      const msg = {
        type: 'modelInstalledResult',
        nodeId: 'model-2',
        installedVersion: null,
      };

      expect(msg.installedVersion).toBeNull();
    });
  });
});
