import { describe, expect, it } from 'vitest';
import {
  DESKTOP_BRIDGE_CHANNELS,
  DESKTOP_AGENT_RUNTIME_IDS,
  DESKTOP_LEGACY_VSCODE_API_GLOBAL,
  assertDesktopBridgeChannel,
  isDesktopBridgeChannel,
  normalizeDesktopAgentRuntimeMessageRequest,
  normalizeDesktopFeatureWebviewMessageRequest,
  normalizeReadWorkspaceFileRequest,
  normalizeViewportIntent,
  normalizeWriteWorkspaceFileRequest,
} from './contracts';

describe('desktop bridge contracts', () => {
  it('names the legacy VSCode-shaped shim explicitly', () => {
    expect(DESKTOP_LEGACY_VSCODE_API_GLOBAL).toBe('vscodeApi');
  });

  it('accepts known bridge channels and rejects unknown channels visibly', () => {
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.getSnapshot)).toBe(true);
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.readWorkspaceFile)).toBe(true);
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.writeWorkspaceFile)).toBe(true);
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendViewportIntent)).toBe(true);
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendFeatureWebviewMessage)).toBe(true);
    expect(isDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendAgentRuntimeMessage)).toBe(true);
    expect(isDesktopBridgeChannel('neko-desktop:missing')).toBe(false);
    expect(() => assertDesktopBridgeChannel('neko-desktop:missing')).toThrow(
      'Unknown desktop bridge channel',
    );
  });

  it('normalizes a renderer viewport intent', () => {
    expect(
      normalizeViewportIntent({
        viewportId: 'engine-viewport-primary',
        action: 'inspect',
        source: 'renderer',
        payload: { resourceId: 'scene-1' },
      }),
    ).toEqual({
      viewportId: 'engine-viewport-primary',
      action: 'inspect',
      source: 'renderer',
      payload: { resourceId: 'scene-1' },
    });
  });

  it('rejects malformed viewport intents', () => {
    expect(() => normalizeViewportIntent(undefined)).toThrow('Viewport intent must be an object');
    expect(() =>
      normalizeViewportIntent({ viewportId: '', action: 'inspect', source: 'renderer' }),
    ).toThrow('viewportId is required');
    expect(() =>
      normalizeViewportIntent({
        viewportId: 'engine-viewport-primary',
        action: 'render',
        source: 'renderer',
      }),
    ).toThrow('Unknown viewport intent action');
    expect(() =>
      normalizeViewportIntent({
        viewportId: 'engine-viewport-primary',
        action: 'inspect',
        source: 'main',
      }),
    ).toThrow('source must be renderer');
  });

  it('normalizes workspace file bridge requests', () => {
    expect(normalizeReadWorkspaceFileRequest({ relativePath: 'notes/./scene.md' })).toEqual({
      relativePath: 'notes/scene.md',
    });
    expect(
      normalizeWriteWorkspaceFileRequest({
        relativePath: 'notes\\scene.md',
        content: 'hello',
      }),
    ).toEqual({
      relativePath: 'notes/scene.md',
      content: 'hello',
      encoding: 'utf8',
    });
  });

  it('rejects workspace file requests that try to escape the workspace', () => {
    expect(() => normalizeReadWorkspaceFileRequest({ relativePath: '../secret.txt' })).toThrow(
      'Workspace file relativePath must stay inside the workspace',
    );
    expect(() =>
      normalizeWriteWorkspaceFileRequest({ relativePath: '/tmp/secret.txt', content: 'nope' }),
    ).toThrow('Workspace file relativePath must stay inside the workspace');
    expect(() =>
      normalizeWriteWorkspaceFileRequest({ relativePath: 'notes/scene.md', content: 1 }),
    ).toThrow('content is required');
  });

  it('normalizes scoped Agent runtime messages', () => {
    const message = { type: 'getSettings' };

    expect(
      normalizeDesktopAgentRuntimeMessageRequest({
        runtimeId: DESKTOP_AGENT_RUNTIME_IDS.agentWebview,
        message,
      }),
    ).toEqual({
      runtimeId: DESKTOP_AGENT_RUNTIME_IDS.agentWebview,
      message,
    });
  });

  it('normalizes scoped feature Webview messages', () => {
    expect(
      normalizeDesktopFeatureWebviewMessageRequest({
        runtimeId: '@neko-canvas/webview/root',
        panelKind: 'canvas-workbench',
        relativePath: 'boards\\intro.nkc',
        message: { type: 'ready' },
      }),
    ).toEqual({
      runtimeId: '@neko-canvas/webview/root',
      panelKind: 'canvas-workbench',
      relativePath: 'boards/intro.nkc',
      message: { type: 'ready' },
    });
  });

  it('rejects malformed feature Webview messages visibly', () => {
    expect(() => normalizeDesktopFeatureWebviewMessageRequest(undefined)).toThrow(
      'Desktop feature Webview message request must be an object',
    );
    expect(() =>
      normalizeDesktopFeatureWebviewMessageRequest({
        runtimeId: '@neko-canvas/webview/host-adapter',
        panelKind: 'canvas-workbench',
        relativePath: 'boards/intro.nkc',
        message: { type: 'ready' },
      }),
    ).toThrow('Unsupported desktop feature Webview runtime');
    expect(() =>
      normalizeDesktopFeatureWebviewMessageRequest({
        runtimeId: '@neko-canvas/webview/root',
        panelKind: 'unknown',
        relativePath: 'boards/intro.nkc',
        message: { type: 'ready' },
      }),
    ).toThrow('Unsupported desktop feature Webview panel');
  });

  it('rejects malformed Agent runtime message requests visibly', () => {
    expect(() => normalizeDesktopAgentRuntimeMessageRequest(undefined)).toThrow(
      'Desktop Agent runtime message request must be an object',
    );
    expect(() => normalizeDesktopAgentRuntimeMessageRequest({ runtimeId: '', message: {} })).toThrow(
      'runtimeId is required',
    );
  });
});
