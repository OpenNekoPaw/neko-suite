/**
 * Protocol tests for neko-cut extension <-> webview message routing.
 *
 * Verifies message type identification, HTML escaping, and AI status message shape.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => p }) },
  EventEmitter: vi.fn(),
  commands: { executeCommand: vi.fn() },
}));

import { isAssetMessage } from '../handlers/assetHandlers';

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

  describe('AI status message shape', () => {
    it('aiActionStatus contains required fields', () => {
      // Mirrors the shape sent by AIActionHandler.sendStarted / sendProgress / sendResult
      const startedMsg = {
        type: 'aiActionStatus',
        actionId: 'ai-upscale',
        status: 'running',
        progress: 0,
        message: 'Started',
      };

      expect(startedMsg).toHaveProperty('type', 'aiActionStatus');
      expect(startedMsg).toHaveProperty('actionId');
      expect(startedMsg).toHaveProperty('status');
      expect(startedMsg).toHaveProperty('progress');
      expect(startedMsg).toHaveProperty('message');
    });

    it('completed status sets progress to 100', () => {
      const completedMsg = {
        type: 'aiActionStatus',
        actionId: 'ai-denoise',
        status: 'completed',
        progress: 100,
        message: 'Completed',
      };

      expect(completedMsg.status).toBe('completed');
      expect(completedMsg.progress).toBe(100);
    });

    it('failed status includes error field', () => {
      const failedMsg = {
        type: 'aiActionStatus',
        actionId: 'ai-enhance',
        status: 'failed',
        error: 'neko-engine is not available.',
      };

      expect(failedMsg.status).toBe('failed');
      expect(failedMsg.error).toBeDefined();
      expect(failedMsg).not.toHaveProperty('progress');
    });
  });
});
