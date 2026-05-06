import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { IAuthSession } from '@neko/shared';
import type { MarketplaceServiceHostAdapters, NekoAuthAPI } from '../MarketplaceService';
import { MarketplaceService } from '../MarketplaceService';
import { MarketplaceHandler } from '../MarketplaceHandler';

vi.mock('vscode', () => ({
  EventEmitter: class {
    private listeners: Array<(e: unknown) => void> = [];

    event = (listener: (e: unknown) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          this.listeners = this.listeners.filter((candidate) => candidate !== listener);
        },
      };
    };

    fire(data: unknown) {
      this.listeners.forEach((listener) => listener(data));
    }

    dispose() {
      this.listeners = [];
    }
  },
  commands: {
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MarketplaceService host adapters', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('injects startup auth token and refreshes it on session changes', async () => {
    const auth = createAuthApi(session('startup-token'));
    const service = await createService({ auth });

    await waitForMicrotasks();
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));
    await service.search({ text: 'startup' });

    expect(lastFetchHeaders().get('Authorization')).toBe('Bearer startup-token');

    auth.emit(session('next-token'));
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));
    await service.search({ text: 'changed' });

    expect(lastFetchHeaders().get('Authorization')).toBe('Bearer next-token');

    auth.emit(null);
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));
    await service.search({ text: 'logout' });

    expect(lastFetchHeaders().has('Authorization')).toBe(false);
    service.dispose();
  });

  it('updates registry URL when settings change and disposes the watcher', async () => {
    const registryChanges: Array<(registryUrl: string | undefined) => void> = [];
    const disposeRegistryWatcher = vi.fn();
    const service = await createService({
      registryUrl: 'https://initial.test/api/v1',
      onDidChangeRegistryUrl: (listener) => {
        registryChanges.push(listener);
        return { dispose: disposeRegistryWatcher };
      },
    });

    await waitForMicrotasks();
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));
    await service.search({ text: 'initial' });

    expect(lastFetchUrl()).toContain('https://initial.test/api/v1/packages');

    mockFetch.mockResolvedValueOnce(jsonResponse({ entitlements: [], etag: 'v2' }));
    registryChanges[0]?.('https://changed.test/api/v1');
    await waitForMicrotasks();
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));
    await service.search({ text: 'changed' });

    expect(lastFetchUrl()).toContain('https://changed.test/api/v1/packages');

    service.dispose();
    expect(disposeRegistryWatcher).toHaveBeenCalledTimes(1);
  });

  it('opens checkout externally using server checkout URL and vscode return deep-link', async () => {
    const openExternal = vi.fn().mockResolvedValue(true);
    const service = await createService({ openExternal });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ url: 'https://pay.test/session/1', sessionId: 's1', expiresAt: 123 }),
    );

    await service.openCheckout('@studio/paid-pack');

    const url = lastFetchUrl();
    const checkoutUrl = new URL(url);
    const returnTo = checkoutUrl.searchParams.get('returnTo');
    expect(url).toContain('/billing/checkout-url?');
    expect(checkoutUrl.searchParams.get('packageId')).toBe('@studio/paid-pack');
    expect(returnTo).toBe('vscode://neko.market/refresh?packageId=%40studio%2Fpaid-pack');
    expect(new URL(returnTo!).searchParams.get('packageId')).toBe('@studio/paid-pack');
    expect(checkoutUrl.searchParams.get('locale')).toBe('zh-CN');
    expect(openExternal).toHaveBeenCalledWith('https://pay.test/session/1');
    service.dispose();
  });

  it('refreshes entitlements and package detail for deep-link return', async () => {
    const service = await createService();

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ entitlements: [], etag: 'v2' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: '@studio/pack', manifest: {}, installState: 'installed' }),
      );

    await service.refreshEntitlements('@studio/pack');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://registry.test/api/v1/me/entitlements/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://registry.test/api/v1/packages/%40studio%2Fpack',
      expect.objectContaining({ method: 'GET' }),
    );
    service.dispose();
  });

  it('opens invoice and support as external registry-owned links', async () => {
    const openExternal = vi.fn().mockResolvedValue(true);
    const service = await createService({ openExternal });

    await service.openInvoice('order-1');
    await service.openSupport('order-2');

    expect(openExternal).toHaveBeenNthCalledWith(
      1,
      'https://registry.test/billing/invoices/order-1',
    );
    expect(openExternal).toHaveBeenNthCalledWith(2, 'https://registry.test/support/orders/order-2');
    service.dispose();
  });
});

describe('MarketplaceHandler typed message validation', () => {
  it('rejects invalid webview messages before calling service', async () => {
    const service = {
      search: vi.fn(),
    };
    const handler = new MarketplaceHandler(
      service as never,
      new ConsoleLogger('test', LogLevel.Off),
    );
    const postMessage = vi.fn();

    await handler.handleMessage(
      { type: 'market:search', query: { types: ['video'] } },
      postMessage,
    );

    expect(service.search).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:error',
      code: 'invalid-message',
      error: 'query.types is invalid',
    });
  });

  it('accepts valid checkout messages and returns typed result projection', async () => {
    const service = {
      openCheckout: vi
        .fn()
        .mockResolvedValue({ url: 'https://pay', sessionId: 's1', expiresAt: 1 }),
    };
    const handler = new MarketplaceHandler(
      service as never,
      new ConsoleLogger('test', LogLevel.Off),
    );
    const postMessage = vi.fn();

    await handler.handleMessage(
      { type: 'market:checkout', packageId: '@studio/pack' },
      postMessage,
    );

    expect(service.openCheckout).toHaveBeenCalledWith('@studio/pack');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:checkoutResult',
      data: { packageId: '@studio/pack', sessionId: 's1' },
    });
  });

  it('echoes validated filterByType messages back to the webview', async () => {
    const handler = new MarketplaceHandler({} as never, new ConsoleLogger('test', LogLevel.Off));
    const postMessage = vi.fn();

    await handler.handleMessage({ type: 'market:filterByType', assetType: 'shader' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:filterByType',
      data: 'shader',
    });
  });

  it('rejects invalid filterByType messages', async () => {
    const handler = new MarketplaceHandler({} as never, new ConsoleLogger('test', LogLevel.Off));
    const postMessage = vi.fn();

    await handler.handleMessage({ type: 'market:filterByType', assetType: 'video' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:error',
      code: 'invalid-message',
      error: 'assetType must be all or a v4 asset type',
    });
  });

  it('delegates cancelInstall messages to the service', async () => {
    const service = {
      cancelInstall: vi.fn().mockReturnValue(true),
    };
    const handler = new MarketplaceHandler(
      service as never,
      new ConsoleLogger('test', LogLevel.Off),
    );
    const postMessage = vi.fn();

    await handler.handleMessage(
      { type: 'market:cancelInstall', packageId: '@studio/proxy' },
      postMessage,
    );

    expect(service.cancelInstall).toHaveBeenCalledWith('@studio/proxy');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:cancelInstallResult',
      data: { packageId: '@studio/proxy', cancelled: true },
    });
  });
});

async function createService(
  overrides: {
    auth?: NekoAuthAPI;
    registryUrl?: string;
    onDidChangeRegistryUrl?: MarketplaceServiceHostAdapters['onDidChangeRegistryUrl'];
    openExternal?: (url: string) => Promise<boolean>;
  } = {},
): Promise<MarketplaceService> {
  const root = await mkdtemp(join(tmpdir(), 'neko-market-extension-test-'));
  return new MarketplaceService(new ConsoleLogger('test', LogLevel.Off), {
    storage: {
      cacheDir: join(root, 'market-cache'),
      installedFile: join(root, 'market-installed.json'),
    },
    host: {
      getRegistryUrl: () => overrides.registryUrl ?? 'https://registry.test/api/v1',
      onDidChangeRegistryUrl:
        overrides.onDidChangeRegistryUrl ??
        (() => ({
          dispose: vi.fn(),
        })),
      getAuthApi: async () => overrides.auth,
      getExtension: () => undefined,
      listExtensions: () => [],
      getExtensionVersion: () => '1.0.0',
      openExternal: overrides.openExternal ?? vi.fn().mockResolvedValue(true),
      getLocale: () => 'zh-CN',
      getRefreshUri: (packageId) => {
        const query = packageId ? `?packageId=${encodeURIComponent(packageId)}` : '';
        return `vscode://neko.market/refresh${query}`;
      },
    },
  });
}

function createAuthApi(initialSession: IAuthSession | null): NekoAuthAPI & {
  emit(session: IAuthSession | null): void;
} {
  const listeners: Array<(session: IAuthSession | null) => void> = [];
  return {
    getSession: vi.fn().mockResolvedValue(initialSession),
    onDidChangeSession: (listener) => {
      listeners.push(listener);
      return {
        dispose: () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      };
    },
    emit: (nextSession) => listeners.forEach((listener) => listener(nextSession)),
  };
}

function session(accessToken: string): IAuthSession {
  return {
    user: 'test@example.com',
    accessToken,
    expiresAt: Date.now() + 60_000,
  };
}

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function lastFetchUrl(): string {
  return mockFetch.mock.calls.at(-1)?.[0] as string;
}

function lastFetchHeaders(): Headers {
  const init = mockFetch.mock.calls.at(-1)?.[1] as RequestInit;
  return new Headers(init.headers);
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
