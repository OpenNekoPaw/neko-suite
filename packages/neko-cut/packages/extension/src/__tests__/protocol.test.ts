/**
 * Protocol integration tests for neko-cut extension.
 *
 * Exercises real production code paths:
 * - isAssetMessage() type guard from assetHandlers
 * - handleAssetMessage() with missing AssetService (SERVICE_NOT_AVAILABLE)
 * - AIActionHandler posting aiActionStatus via webview.postMessage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }) },
  commands: { executeCommand: vi.fn().mockResolvedValue(null) },
  window: { showWarningMessage: vi.fn() },
  EventEmitter: vi.fn(),
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
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

import { isAssetMessage, handleAssetMessage } from '../handlers/assetHandlers';
import { AIActionHandler } from '../services/AIActionHandler';

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
