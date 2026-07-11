import { describe, expect, it, vi } from 'vitest';
import { tryRouteOwnedAgentTurnTimelineSnapshot } from '../agentTurnTimelineSnapshotRouter';

const snapshotRequest = {
  type: 'requestAgentTurnTimelineSnapshot',
  schemaVersion: 2,
  connectionEpoch: 'epoch-1',
  conversationId: 'conversation-1',
  turnId: 'turn-1',
  messageId: 'message-1',
  reason: 'webview-reload',
  lastAppliedDeliveryRevision: 1,
} as const;

describe('tryRouteOwnedAgentTurnTimelineSnapshot', () => {
  it('routes an explicitly owned request before the normal turn handler', async () => {
    const webview = { postMessage: vi.fn() };
    const router = {
      owns: vi.fn(() => true),
      requestSnapshot: vi.fn(async () => undefined),
    };

    await expect(
      tryRouteOwnedAgentTurnTimelineSnapshot({
        router,
        webview: webview as never,
        message: snapshotRequest,
      }),
    ).resolves.toBe(true);
    expect(router.requestSnapshot).toHaveBeenCalledWith(webview, snapshotRequest);
  });

  it('leaves unrelated and unowned requests on the canonical normal route', async () => {
    const router = {
      owns: vi.fn(() => false),
      requestSnapshot: vi.fn(async () => undefined),
    };

    await expect(
      tryRouteOwnedAgentTurnTimelineSnapshot({
        router,
        webview: {} as never,
        message: snapshotRequest,
      }),
    ).resolves.toBe(false);
    await expect(
      tryRouteOwnedAgentTurnTimelineSnapshot({
        router,
        webview: {} as never,
        message: { type: 'getConversations' },
      }),
    ).resolves.toBe(false);
    expect(router.requestSnapshot).not.toHaveBeenCalled();
  });
});
