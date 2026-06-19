import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module with working EventEmitter
// ============================================================================

vi.mock('vscode', () => {
  class VscodeEventEmitter<T> {
    private listeners: Array<(data: T) => void> = [];
    event = (listener: (data: T) => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    };
    fire = (data: T) => {
      this.listeners.forEach((l) => l(data));
    };
    dispose = vi.fn();
  }
  return {
    Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
    commands: { executeCommand: vi.fn() },
    window: { showErrorMessage: vi.fn() },
    EventEmitter: VscodeEventEmitter,
  };
});

import { AuthTokenError, AuthNetworkError } from '@neko/auth-core';
import { NekoAuthAPIImpl } from '../auth-api';

// ============================================================================
// Tests: AuthTokenError (real production class)
// ============================================================================

describe('AuthTokenError -- isTokenInvalid getter', () => {
  it('returns true for HTTP 401 (unauthorized)', () => {
    const err = new AuthTokenError('Unauthorized', 401);

    expect(err.isTokenInvalid).toBe(true);
    expect(err.code).toBe('AUTH_TOKEN_ERROR');
    expect(err.status).toBe(401);
  });

  it('returns true for HTTP 403 (forbidden)', () => {
    const err = new AuthTokenError('Forbidden', 403);

    expect(err.isTokenInvalid).toBe(true);
  });

  it('returns false for HTTP 500 (server error)', () => {
    const err = new AuthTokenError('Internal Server Error', 500);

    expect(err.isTokenInvalid).toBe(false);
    expect(err.status).toBe(500);
  });

  it('returns false when status is undefined', () => {
    const err = new AuthTokenError('Unknown failure');

    expect(err.isTokenInvalid).toBe(false);
    expect(err.status).toBeUndefined();
  });
});

describe('AuthNetworkError -- distinct error type', () => {
  it('has AUTH_NETWORK_ERROR code', () => {
    const err = new AuthNetworkError('Connection refused');

    expect(err.code).toBe('AUTH_NETWORK_ERROR');
    expect(err.name).toBe('AuthNetworkError');
    expect(err.message).toBe('Connection refused');
  });
});

// ============================================================================
// Tests: NekoAuthAPIImpl (real production class)
// ============================================================================

describe('NekoAuthAPIImpl -- construction and event wiring', () => {
  let mockService: {
    onDidRefresh: ((session: unknown) => void) | null;
    getSession: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockCatalogClient: {
    fetchCatalog: ReturnType<typeof vi.fn>;
  };
  let mockContext: {
    subscriptions: Array<{ dispose: () => void }>;
  };

  beforeEach(() => {
    mockService = {
      onDidRefresh: null,
      getSession: vi.fn().mockResolvedValue(null),
      login: vi.fn().mockResolvedValue({ userId: 'u1', token: 'tok' }),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    mockCatalogClient = {
      fetchCatalog: vi.fn().mockResolvedValue({
        source: 'account-gateway',
        status: 'available',
        provider: {
          id: 'neko-account-gateway',
          name: 'neko-account-gateway',
          displayName: 'Neko Official',
          type: 'newapi',
          apiUrl: '',
          enabled: true,
          connectionKind: 'gateway',
          protocolProfile: 'newapi-compatible',
          supportLevel: 'verified',
          requiresApiKey: false,
        },
        models: [
          {
            id: 'gpt-4o-mini',
            name: 'gpt-4o-mini',
            providerId: 'neko-account-gateway',
            type: 'llm',
            capabilities: ['chat'],
            enabled: true,
          },
        ],
        entitlement: { allowedModelIds: ['gpt-4o-mini'] },
        expiresAt: Date.now() + 60_000,
      }),
    };
    mockContext = { subscriptions: [] };
  });

  it('registers itself in context.subscriptions for cleanup', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new NekoAuthAPIImpl(mockService as any, mockContext as any);

    expect(mockContext.subscriptions.length).toBe(1);
    expect(typeof mockContext.subscriptions[0]?.dispose).toBe('function');
  });

  it('exposes onDidChangeSession as an event', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new NekoAuthAPIImpl(mockService as any, mockContext as any);

    expect(typeof api.onDidChangeSession).toBe('function');
  });

  it('fires onDidChangeSession when service.onDidRefresh is called (NKAT-001)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new NekoAuthAPIImpl(mockService as any, mockContext as any);

    const received: unknown[] = [];
    api.onDidChangeSession((session) => received.push(session));

    // Simulate a silent token refresh from the auth service
    const refreshedSession = { userId: 'u1', token: 'refreshed-tok' };
    mockService.onDidRefresh!(refreshedSession);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(refreshedSession);
  });

  it('fires onDidChangeSession on login()', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new NekoAuthAPIImpl(mockService as any, mockContext as any);

    const received: unknown[] = [];
    api.onDidChangeSession((session) => received.push(session));

    await api.login();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ userId: 'u1', token: 'tok' });
  });

  it('fires onDidChangeSession with null on logout()', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new NekoAuthAPIImpl(mockService as any, mockContext as any);

    const received: unknown[] = [];
    api.onDidChangeSession((session) => received.push(session));

    await api.logout();

    expect(received).toHaveLength(1);
    expect(received[0]).toBeNull();
  });

  it('getCloudToken returns null (Phase 2 stub)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = new NekoAuthAPIImpl(mockService as any, mockContext as any);

    const token = await api.getCloudToken('github');
    expect(token).toBeNull();
  });

  it('returns null account AI catalog when there is no session', async () => {
    const api = new NekoAuthAPIImpl(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCatalogClient as any,
    );

    await expect(api.getAccountAiCatalog()).resolves.toBeNull();
    expect(mockCatalogClient.fetchCatalog).not.toHaveBeenCalled();
  });

  it('fetches account AI catalog only through the injected catalog client', async () => {
    const session = {
      user: 'alice@example.com',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    };
    mockService.getSession.mockResolvedValue(session);
    const api = new NekoAuthAPIImpl(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCatalogClient as any,
    );

    const catalog = await api.getAccountAiCatalog();

    expect(mockCatalogClient.fetchCatalog).toHaveBeenCalledWith(session);
    expect(catalog).toMatchObject({
      source: 'account-gateway',
      status: 'available',
    });
    expect(JSON.stringify(catalog)).not.toContain('access-token');
    expect(JSON.stringify(catalog)).not.toContain('refresh-token');
  });

  it('returns null account AI catalog after logout clears the session', async () => {
    const session = {
      user: 'alice@example.com',
      accessToken: 'access-token',
      expiresAt: Date.now() + 60_000,
    };
    mockService.getSession.mockResolvedValueOnce(session).mockResolvedValueOnce(null);
    const api = new NekoAuthAPIImpl(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCatalogClient as any,
    );

    await expect(api.getAccountAiCatalog()).resolves.toMatchObject({
      source: 'account-gateway',
    });
    await api.logout();

    await expect(api.getAccountAiCatalog()).resolves.toBeNull();
    expect(mockCatalogClient.fetchCatalog).toHaveBeenCalledTimes(1);
  });
});
