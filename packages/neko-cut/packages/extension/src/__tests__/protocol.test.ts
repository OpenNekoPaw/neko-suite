/**
 * Protocol integration tests for neko-cut extension.
 *
 * Exercises real production code paths:
 * - isAssetMessage() type guard from assetHandlers
 * - handleAssetMessage() with missing AssetService (SERVICE_NOT_AVAILABLE)
 * - AIActionHandler posting aiActionStatus via webview.postMessage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const cmdState = vi.hoisted(() => {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  return { commands };
});

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }) },
  commands: {
    registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
      cmdState.commands.set(id, handler);
      return { dispose: vi.fn() };
    }),
    executeCommand: vi.fn().mockResolvedValue(null),
  },
  window: { showWarningMessage: vi.fn() },
  EventEmitter: vi.fn(),
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
  l10n: { t: vi.fn((key: string) => key) },
}));

vi.mock('../base', () => ({
  getService: vi.fn(() => null),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  createServiceId: vi.fn((id: string) => id),
  ServiceCollection: vi.fn(),
  getGlobalServices: vi.fn(),
  setGlobalServices: vi.fn(),
  setRootLogger: vi.fn(),
  getRootLogger: vi.fn(),
  setErrorHandler: vi.fn(),
  getErrorHandler: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('../services/TimelineToolExecutor', () => ({
  TimelineToolExecutor: vi.fn().mockImplementation(function () {
    return {
      execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
    };
  }),
}));

vi.mock('../bootstrap/toolsBootstrap', () => ({}));

import { isAssetMessage, handleAssetMessage } from '../handlers/assetHandlers';
import { AIActionHandler } from '../services/AIActionHandler';
import { registerTimelineCommands } from '../commands/timeline-commands';

describe('neko-cut protocol', () => {
  describe('isAssetMessage', () => {
    it('returns true for messages with asset: prefix', () => {
      expect(isAssetMessage({ type: 'asset:createEntity' })).toBe(true);
      expect(isAssetMessage({ type: 'asset:search' })).toBe(true);
      expect(isAssetMessage({ type: 'asset:flush' })).toBe(true);
    });

    it('returns false for non-asset messages', () => {
      expect(isAssetMessage({ type: 'updateTimeline' })).toBe(false);
      expect(isAssetMessage({ type: 'aiActionStatus' })).toBe(false);
    });

    it('returns false for invalid inputs', () => {
      expect(isAssetMessage(null)).toBe(false);
      expect(isAssetMessage(undefined)).toBe(false);
      expect(isAssetMessage({})).toBe(false);
      expect(isAssetMessage({ type: 42 })).toBe(false);
    });
  });

  describe('handleAssetMessage — no AssetService', () => {
    it('responds with asset:error SERVICE_NOT_AVAILABLE when service is null', async () => {
      const postMessage = vi.fn();

      const result = await handleAssetMessage(
        { type: 'asset:createEntity', payload: { name: 'test' } } as any,
        postMessage,
      );

      expect(result).toBe(true);
      expect(postMessage).toHaveBeenCalledOnce();
      const response = postMessage.mock.calls[0]![0];
      expect(response.type).toBe('asset:error');
      expect(response.payload.code).toBe('SERVICE_NOT_AVAILABLE');
    });

    it('includes _requestId in error response when present', async () => {
      const postMessage = vi.fn();

      await handleAssetMessage(
        { type: 'asset:search', payload: {}, _requestId: 'req-42' } as any,
        postMessage,
      );

      const response = postMessage.mock.calls[0]![0];
      expect(response._requestId).toBe('req-42');
      expect(response.type).toBe('asset:error');
    });
  });

  describe('AIActionHandler', () => {
    let mockWebview: { postMessage: ReturnType<typeof vi.fn> };
    let handler: AIActionHandler;

    beforeEach(() => {
      mockWebview = { postMessage: vi.fn() };
      const mockUri = { scheme: 'file', fsPath: '/tmp/test.nkv', path: '/tmp/test.nkv' };
      handler = new AIActionHandler(mockWebview as any, mockUri as any);
    });

    it('sends aiActionStatus with status running on action start', async () => {
      await handler.handleAction('ai-upscale', ['elem-1']);

      expect(mockWebview.postMessage).toHaveBeenCalled();
      const firstCall = mockWebview.postMessage.mock.calls[0]![0];
      expect(firstCall.type).toBe('aiActionStatus');
      expect(firstCall.actionId).toBe('ai-upscale');
      expect(firstCall.status).toBe('running');
    });

    it('sends failed status when engine is unavailable', async () => {
      await handler.handleAction('ai-upscale', ['elem-1']);

      const calls = mockWebview.postMessage.mock.calls;
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall.type).toBe('aiActionStatus');
      expect(lastCall.status).toBe('failed');
      expect(lastCall.error).toBeDefined();
    });

    it('sends failed status for stub actions (ai-auto-edit)', async () => {
      await handler.handleAction('ai-auto-edit', ['elem-1']);

      const calls = mockWebview.postMessage.mock.calls;
      const lastCall = calls[calls.length - 1]![0];
      expect(lastCall.status).toBe('failed');
      expect(lastCall.error).toContain('not yet available');
    });
  });
});

// ============================================================================
// Tests: Timeline command registration (NKC-010)
// ============================================================================

describe('timeline command registration (NKC-010)', () => {
  beforeEach(() => {
    cmdState.commands.clear();
  });

  it('registers core timeline commands', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.timeline.getInfo')).toBe(true);
    expect(cmdState.commands.has('neko.element.add')).toBe(true);
    expect(cmdState.commands.has('neko.element.delete')).toBe(true);
    expect(cmdState.commands.has('neko.timeline.listElements')).toBe(true);
  });

  it('registers element update command', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.element.update')).toBe(true);
    expect(cmdState.commands.has('neko.element.getInfo')).toBe(true);
  });

  it('registers track management commands', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.track.add')).toBe(true);
    expect(cmdState.commands.has('neko.track.delete')).toBe(true);
    expect(cmdState.commands.has('neko.track.reorder')).toBe(true);
  });

  it('registers effect and transition commands', () => {
    const mockContext = { subscriptions: [], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    expect(cmdState.commands.has('neko.effect.list')).toBe(true);
    expect(cmdState.commands.has('neko.effect.add')).toBe(true);
    expect(cmdState.commands.has('neko.transition.add')).toBe(true);
    expect(cmdState.commands.has('neko.transition.remove')).toBe(true);
  });

  it('pushes disposables into context.subscriptions', () => {
    const mockContext = { subscriptions: [] as any[], extensionUri: { fsPath: '/test' } };
    const mockProvider = { getActiveWebview: vi.fn(), getActiveExportService: vi.fn() };

    registerTimelineCommands(mockContext as any, mockProvider as any);

    // Each registered command pushes a disposable
    expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    // Every subscription should have a dispose method
    for (const sub of mockContext.subscriptions) {
      expect(sub).toHaveProperty('dispose');
    }
  });
});
