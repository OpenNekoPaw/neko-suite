import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as http from 'node:http';
import { NekoAuthService } from '../neko-auth-service';
import { AuthNotConfiguredError } from '../types';
import type { ITokenStorage, IAuthSession, AuthConfig } from '@neko/shared';

/** Real HTTP GET that bypasses any fetch mock */
function httpGet(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class MemoryStorage implements ITokenStorage {
  private store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

const makeConfig = (overrides: Partial<AuthConfig> = {}): AuthConfig => ({
  clientId: 'test-client',
  authUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  scopes: ['read'],
  redirectPort: 6419,
  ...overrides,
});

const makeSession = (overrides: Partial<IAuthSession> = {}): IAuthSession => ({
  user: 'alice@example.com',
  accessToken: 'access-abc',
  refreshToken: 'refresh-abc',
  expiresAt: Date.now() + 3600 * 1000,
  ...overrides,
});

const mockOpenUrl = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('NekoAuthService.getSession', () => {
  it('returns null when no session is stored', async () => {
    const service = new NekoAuthService(new MemoryStorage(), makeConfig(), mockOpenUrl);
    expect(await service.getSession()).toBeNull();
  });

  it('returns a valid (non-expired) session directly', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    // Pre-populate storage with a fresh session
    const session = makeSession();
    await storage.set('neko.auth.session', JSON.stringify(session));

    const result = await service.getSession();
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe('access-abc');
  });

  it('attempts refresh when session is expired', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    // Store an expired session + refresh token
    const expiredSession = makeSession({ expiresAt: Date.now() - 1 });
    await storage.set('neko.auth.session', JSON.stringify(expiredSession));
    await storage.set('neko.auth.refresh', 'refresh-abc');

    // Mock the token endpoint for refresh
    const newTokenResponse = {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      user: 'alice@example.com',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => newTokenResponse,
      }),
    );

    const result = await service.getSession();
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe('new-access');

    vi.unstubAllGlobals();
  });

  it('returns null when expired session has no refresh token', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    const expiredSession = makeSession({ expiresAt: Date.now() - 1, refreshToken: undefined });
    await storage.set('neko.auth.session', JSON.stringify(expiredSession));
    // No refresh token stored

    const result = await service.getSession();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe('NekoAuthService.refresh', () => {
  it('returns null when no refresh token stored', async () => {
    const service = new NekoAuthService(new MemoryStorage(), makeConfig(), mockOpenUrl);
    expect(await service.refresh()).toBeNull();
  });

  it('clears session and returns null when refresh fails', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    await storage.set('neko.auth.refresh', 'expired-refresh');
    await storage.set('neko.auth.session', JSON.stringify(makeSession()));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'token expired',
      }),
    );

    const result = await service.refresh();
    expect(result).toBeNull();

    // Session should be cleared
    const stored = await storage.get('neko.auth.session');
    expect(stored).toBeNull();

    vi.unstubAllGlobals();
  });

  it('returns new session on successful refresh', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    await storage.set('neko.auth.refresh', 'valid-refresh');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-access',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      }),
    );

    const result = await service.refresh();
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe('refreshed-access');

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('NekoAuthService.logout', () => {
  it('clears session and refresh token', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    await storage.set('neko.auth.session', JSON.stringify(makeSession()));
    await storage.set('neko.auth.refresh', 'refresh-abc');

    await service.logout();

    expect(await storage.get('neko.auth.session')).toBeNull();
    expect(await storage.get('neko.auth.refresh')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('NekoAuthService.login', () => {
  it('throws AuthNotConfiguredError when authUrl is empty', async () => {
    const service = new NekoAuthService(
      new MemoryStorage(),
      makeConfig({ authUrl: '' }),
      mockOpenUrl,
    );
    await expect(service.login()).rejects.toThrow(AuthNotConfiguredError);
  });

  it('returns existing session when not forcing', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    const session = makeSession();
    await storage.set('neko.auth.session', JSON.stringify(session));

    const result = await service.login();
    expect(result.accessToken).toBe('access-abc');
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it('opens browser and exchanges code on force login', async () => {
    const storage = new MemoryStorage();
    const service = new NekoAuthService(storage, makeConfig(), mockOpenUrl);

    // Pre-store a session to test force=true bypasses cache
    await storage.set('neko.auth.session', JSON.stringify(makeSession()));

    const tokenResponse = {
      access_token: 'force-access',
      expires_in: 3600,
      token_type: 'Bearer',
      user: 'bob@example.com',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      }),
    );

    const port = 26419;
    const configWithPort = makeConfig({ redirectPort: port });
    const serviceWithPort = new NekoAuthService(storage, configWithPort, mockOpenUrl);

    // Simulate the callback after a short delay
    const loginPromise = serviceWithPort.login({ force: true });
    await new Promise<void>((r) => setTimeout(r, 50));

    // Peek at what URL was opened to extract the state
    const openedUrl = new URL(mockOpenUrl.mock.lastCall![0]!);
    const state = openedUrl.searchParams.get('state')!;

    // Simulate browser redirect using real HTTP (fetch is mocked, can't use it here)
    await httpGet(`http://localhost:${port}/callback?code=auth-code&state=${state}`);

    const result = await loginPromise;
    expect(result.accessToken).toBe('force-access');
    expect(mockOpenUrl).toHaveBeenCalled();

    vi.unstubAllGlobals();
    mockOpenUrl.mockClear();
  });
});
