import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestVsCodeApi {
  postMessage: (msg: unknown) => void;
}

declare global {
  var acquireVsCodeApi: () => TestVsCodeApi;
}

async function loadMessages() {
  vi.resetModules();
  const postMessage = vi.fn();
  globalThis.acquireVsCodeApi = () => ({ postMessage });
  const mod = await import('./index');

  return {
    MarketMessages: mod.MarketMessages,
    postMessage,
  };
}

describe('MarketMessages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts v4 browse query filters through a typed search message', async () => {
    const { MarketMessages, postMessage } = await loadMessages();

    MarketMessages.search({
      text: 'cinematic',
      category: 'tooling',
      types: ['preset'],
      semantic: { kind: 'lut' },
      sort: 'featured',
      order: 'desc',
    });

    expect(postMessage).toHaveBeenCalledWith({
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
    const { MarketMessages, postMessage } = await loadMessages();

    MarketMessages.checkout('@studio/paid-media');
    MarketMessages.checkout('@studio/paid-media', 'renew');

    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'market:checkout',
      packageId: '@studio/paid-media',
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'market:renew',
      packageId: '@studio/paid-media',
    });
  });

  it('posts entitlement refresh and listing messages', async () => {
    const { MarketMessages, postMessage } = await loadMessages();

    MarketMessages.listEntitlements();
    MarketMessages.refreshEntitlements('@studio/owned-media');

    expect(postMessage).toHaveBeenNthCalledWith(1, { type: 'market:listEntitlements' });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'market:refreshEntitlements',
      packageId: '@studio/owned-media',
    });
  });

  it('posts server capability probe message', async () => {
    const { MarketMessages, postMessage } = await loadMessages();

    MarketMessages.getServerInfo();

    expect(postMessage).toHaveBeenCalledWith({ type: 'market:getServerInfo' });
  });

  it('posts cancel install messages for active downloads', async () => {
    const { MarketMessages, postMessage } = await loadMessages();

    MarketMessages.cancelInstall('@studio/proxy-media');

    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:cancelInstall',
      packageId: '@studio/proxy-media',
    });
  });
});
