import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockWebviewWindow, type MockWebviewWindow } from '@neko/shared/vscode/test-utils';

async function loadMessages() {
  vi.resetModules();
  const mockWindow = installMockWebviewWindow();
  const mod = await import('./index');

  return {
    MarketMessages: mod.MarketMessages,
    mockWindow,
  };
}

describe('MarketMessages', () => {
  const mockWindows: MockWebviewWindow[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const mockWindow of mockWindows.splice(0)) {
      mockWindow.dispose();
    }
  });

  async function loadMockedMessages() {
    const loaded = await loadMessages();
    mockWindows.push(loaded.mockWindow);
    return loaded;
  }

  it('posts ready through the shared VS Code bridge', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.ready();

    expect(mockWindow.acquireCalls).toBe(1);
    expect(mockWindow.api.postedMessages).toEqual([{ type: 'market:ready' }]);
  });

  it('posts v4 browse query filters through a typed search message', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.search({
      text: 'cinematic',
      category: 'tooling',
      types: ['preset'],
      semantic: { kind: 'lut' },
      sort: 'featured',
      order: 'desc',
    });

    expect(mockWindow.api.postedMessages).toContainEqual({
      type: 'market:search',
      query: {
        text: 'cinematic',
        category: 'tooling',
        types: ['preset'],
        semantic: { kind: 'lut' },
        sort: 'featured',
        order: 'desc',
      },
    });
  });

  it('posts external checkout and renewal actions without payment state', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.checkout('@studio/paid-media');
    MarketMessages.checkout('@studio/paid-media', 'renew');

    expect(mockWindow.api.postedMessages[0]).toEqual({
      type: 'market:checkout',
      packageId: '@studio/paid-media',
    });
    expect(mockWindow.api.postedMessages[1]).toEqual({
      type: 'market:renew',
      packageId: '@studio/paid-media',
    });
  });

  it('posts entitlement refresh and listing messages', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.listEntitlements();
    MarketMessages.refreshEntitlements('@studio/owned-media');

    expect(mockWindow.api.postedMessages[0]).toEqual({ type: 'market:listEntitlements' });
    expect(mockWindow.api.postedMessages[1]).toEqual({
      type: 'market:refreshEntitlements',
      packageId: '@studio/owned-media',
    });
  });

  it('posts server capability probe message', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.getServerInfo();

    expect(mockWindow.api.postedMessages).toContainEqual({ type: 'market:getServerInfo' });
  });

  it('posts governance and local install management messages', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.getGovernanceState();
    MarketMessages.setDeveloperMode({ enabled: true, riskAccepted: true, durationMs: 1000 });
    MarketMessages.promoteWorkspaceTrust();
    MarketMessages.requestLocalInstall('local-link');
    MarketMessages.confirmLocalInstall({ draftId: 'draft-1', storageMode: 'copy-managed' });
    MarketMessages.cancelLocalInstall('draft-1');
    MarketMessages.revealLocal('@local/plugin');

    expect(mockWindow.api.postedMessages[0]).toEqual({ type: 'market:getGovernanceState' });
    expect(mockWindow.api.postedMessages[1]).toEqual({
      type: 'market:setDeveloperMode',
      enabled: true,
      riskAccepted: true,
      durationMs: 1000,
    });
    expect(mockWindow.api.postedMessages[2]).toEqual({ type: 'market:promoteWorkspaceTrust' });
    expect(mockWindow.api.postedMessages[3]).toEqual({
      type: 'market:requestLocalInstall',
      storageMode: 'local-link',
    });
    expect(mockWindow.api.postedMessages[4]).toEqual({
      type: 'market:confirmLocalInstall',
      draftId: 'draft-1',
      storageMode: 'copy-managed',
    });
    expect(mockWindow.api.postedMessages[5]).toEqual({
      type: 'market:cancelLocalInstall',
      draftId: 'draft-1',
    });
    expect(mockWindow.api.postedMessages[6]).toEqual({
      type: 'market:revealLocal',
      packageId: '@local/plugin',
    });
  });

  it('posts cancel install messages for active downloads', async () => {
    const { MarketMessages, mockWindow } = await loadMockedMessages();

    MarketMessages.cancelInstall('@studio/proxy-media');

    expect(mockWindow.api.postedMessages).toContainEqual({
      type: 'market:cancelInstall',
      packageId: '@studio/proxy-media',
    });
  });
});
