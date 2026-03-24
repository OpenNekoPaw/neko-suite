/**
 * TokenManager — persists, loads, and checks expiry of auth sessions.
 */

import type { IAuthSession, ITokenStorage } from '@neko/shared';
import { StorageKeys, type RawTokenResponse } from './types';

/** Number of seconds before actual expiry to treat a token as expired */
const EXPIRY_BUFFER_S = 60;

export class TokenManager {
  constructor(private readonly storage: ITokenStorage) {}

  // ---------------------------------------------------------------------------
  // Persist
  // ---------------------------------------------------------------------------

  async saveSession(raw: RawTokenResponse): Promise<IAuthSession> {
    const expiresAt = Date.now() + raw.expires_in * 1000;

    const session: IAuthSession = {
      user: raw.user ?? 'unknown',
      plan: raw.plan,
      usage: raw.usage,
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      expiresAt,
    };

    await this.storage.set(StorageKeys.SESSION, JSON.stringify(session));

    if (raw.refresh_token) {
      await this.storage.set(StorageKeys.REFRESH_TOKEN, raw.refresh_token);
    }

    return session;
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  async loadSession(): Promise<IAuthSession | null> {
    const raw = await this.storage.get(StorageKeys.SESSION);
    if (!raw) return null;

    try {
      const session = JSON.parse(raw) as IAuthSession;
      return session;
    } catch {
      return null;
    }
  }

  async loadRefreshToken(): Promise<string | null> {
    return this.storage.get(StorageKeys.REFRESH_TOKEN);
  }

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  async clearSession(): Promise<void> {
    await Promise.all([
      this.storage.delete(StorageKeys.SESSION),
      this.storage.delete(StorageKeys.REFRESH_TOKEN),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Expiry
  // ---------------------------------------------------------------------------

  isExpired(session: IAuthSession): boolean {
    return Date.now() >= session.expiresAt - EXPIRY_BUFFER_S * 1000;
  }
}
