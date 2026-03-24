import { describe, it, expect, beforeEach } from 'vitest';
import { TokenManager } from '../token-manager';
import { StorageKeys } from '../types';
import type { ITokenStorage, IAuthSession } from '@neko/shared';
import type { RawTokenResponse } from '../types';

// ---------------------------------------------------------------------------
// In-memory ITokenStorage mock
// ---------------------------------------------------------------------------

class MemoryStorage implements ITokenStorage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRawToken = (overrides: Partial<RawTokenResponse> = {}): RawTokenResponse => ({
  access_token: 'access-xyz',
  refresh_token: 'refresh-xyz',
  expires_in: 3600,
  token_type: 'Bearer',
  user: 'alice@example.com',
  plan: 'Pro',
  usage: 42,
  ...overrides,
});

// ---------------------------------------------------------------------------
// saveSession
// ---------------------------------------------------------------------------

describe('TokenManager.saveSession', () => {
  let storage: MemoryStorage;
  let manager: TokenManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    manager = new TokenManager(storage);
  });

  it('returns a session with correct fields', async () => {
    const raw = makeRawToken();
    const session = await manager.saveSession(raw);

    expect(session.accessToken).toBe('access-xyz');
    expect(session.refreshToken).toBe('refresh-xyz');
    expect(session.user).toBe('alice@example.com');
    expect(session.plan).toBe('Pro');
    expect(session.usage).toBe(42);
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it('sets expiresAt roughly expires_in ms from now', async () => {
    const before = Date.now();
    const session = await manager.saveSession(makeRawToken({ expires_in: 3600 }));
    const after = Date.now();

    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(session.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);
  });

  it('persists session JSON to storage', async () => {
    await manager.saveSession(makeRawToken());
    const raw = await storage.get(StorageKeys.SESSION);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as IAuthSession;
    expect(parsed.accessToken).toBe('access-xyz');
  });

  it('persists refresh token separately', async () => {
    await manager.saveSession(makeRawToken());
    const rt = await storage.get(StorageKeys.REFRESH_TOKEN);
    expect(rt).toBe('refresh-xyz');
  });

  it('does not store refresh token key when absent', async () => {
    await manager.saveSession(makeRawToken({ refresh_token: undefined }));
    expect(storage.has(StorageKeys.REFRESH_TOKEN)).toBe(false);
  });

  it('uses "unknown" for user when not provided', async () => {
    const session = await manager.saveSession(makeRawToken({ user: undefined }));
    expect(session.user).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// loadSession
// ---------------------------------------------------------------------------

describe('TokenManager.loadSession', () => {
  let storage: MemoryStorage;
  let manager: TokenManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    manager = new TokenManager(storage);
  });

  it('returns null when nothing stored', async () => {
    expect(await manager.loadSession()).toBeNull();
  });

  it('returns the saved session', async () => {
    const saved = await manager.saveSession(makeRawToken());
    const loaded = await manager.loadSession();

    expect(loaded).not.toBeNull();
    expect(loaded!.accessToken).toBe(saved.accessToken);
    expect(loaded!.expiresAt).toBe(saved.expiresAt);
  });

  it('returns null on malformed JSON', async () => {
    await storage.set(StorageKeys.SESSION, 'not-valid-json{{{');
    expect(await manager.loadSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadRefreshToken
// ---------------------------------------------------------------------------

describe('TokenManager.loadRefreshToken', () => {
  let storage: MemoryStorage;
  let manager: TokenManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    manager = new TokenManager(storage);
  });

  it('returns null when not stored', async () => {
    expect(await manager.loadRefreshToken()).toBeNull();
  });

  it('returns the stored refresh token', async () => {
    await manager.saveSession(makeRawToken({ refresh_token: 'my-refresh' }));
    expect(await manager.loadRefreshToken()).toBe('my-refresh');
  });
});

// ---------------------------------------------------------------------------
// clearSession
// ---------------------------------------------------------------------------

describe('TokenManager.clearSession', () => {
  let storage: MemoryStorage;
  let manager: TokenManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    manager = new TokenManager(storage);
  });

  it('removes both session and refresh token', async () => {
    await manager.saveSession(makeRawToken());
    await manager.clearSession();

    expect(await manager.loadSession()).toBeNull();
    expect(await manager.loadRefreshToken()).toBeNull();
    expect(storage.has(StorageKeys.SESSION)).toBe(false);
    expect(storage.has(StorageKeys.REFRESH_TOKEN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------

describe('TokenManager.isExpired', () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager(new MemoryStorage());
  });

  it('returns false for a fresh session', () => {
    const session: IAuthSession = {
      user: 'u',
      accessToken: 'a',
      expiresAt: Date.now() + 3600 * 1000,
    };
    expect(manager.isExpired(session)).toBe(false);
  });

  it('returns true for an expired session', () => {
    const session: IAuthSession = {
      user: 'u',
      accessToken: 'a',
      expiresAt: Date.now() - 1,
    };
    expect(manager.isExpired(session)).toBe(true);
  });

  it('returns true when within 60s buffer', () => {
    const session: IAuthSession = {
      user: 'u',
      accessToken: 'a',
      expiresAt: Date.now() + 30 * 1000, // 30s left — within 60s buffer
    };
    expect(manager.isExpired(session)).toBe(true);
  });

  it('returns false just outside the 60s buffer', () => {
    const session: IAuthSession = {
      user: 'u',
      accessToken: 'a',
      expiresAt: Date.now() + 90 * 1000, // 90s left — outside 60s buffer
    };
    expect(manager.isExpired(session)).toBe(false);
  });
});
