/**
 * NekoAuthService — implements IAuthProvider.
 *
 * Composes OAuthClient + TokenManager.
 * The openUrl callback is injected so this class stays environment-agnostic
 * (VSCode uses vscode.env.openExternal, CLI uses the 'open' package).
 */

import type { IAuthSession, IAuthProvider, ITokenStorage, AuthConfig } from '@neko/shared';
import { OAuthClient, generatePKCE } from './oauth-client';
import { TokenManager } from './token-manager';
import { AuthNotConfiguredError } from './types';

/** Callback to open a URL in the user's default browser */
export type OpenUrlFn = (url: string) => Promise<void>;

export class NekoAuthService implements IAuthProvider {
  private readonly client: OAuthClient;
  private readonly tokenManager: TokenManager;

  constructor(
    storage: ITokenStorage,
    private readonly config: AuthConfig,
    private readonly openUrl: OpenUrlFn,
  ) {
    this.client = new OAuthClient();
    this.tokenManager = new TokenManager(storage);
  }

  // ---------------------------------------------------------------------------
  // IAuthProvider
  // ---------------------------------------------------------------------------

  async getSession(): Promise<IAuthSession | null> {
    const session = await this.tokenManager.loadSession();
    if (!session) return null;

    if (!this.tokenManager.isExpired(session)) return session;

    // Try to silently refresh
    return this.refresh();
  }

  async login(options?: { force?: boolean }): Promise<IAuthSession> {
    if (!this.config.authUrl) throw new AuthNotConfiguredError();

    // If already have a valid session and not forcing, return it
    if (!options?.force) {
      const existing = await this.getSession();
      if (existing) return existing;
    }

    const pkce = await generatePKCE();
    const state = crypto.randomUUID();
    const port = this.config.redirectPort ?? 6419;

    const authUrl = this.client.buildAuthUrl(this.config, pkce, state);

    // Start callback server before opening the browser to avoid race
    const callbackPromise = this.client.startCallbackServer(port, state);

    await this.openUrl(authUrl);

    const { code } = await callbackPromise;
    const raw = await this.client.exchangeCode(this.config, code, pkce.verifier);
    return this.tokenManager.saveSession(raw);
  }

  async logout(): Promise<void> {
    await this.tokenManager.clearSession();
  }

  async refresh(): Promise<IAuthSession | null> {
    const refreshToken = await this.tokenManager.loadRefreshToken();
    if (!refreshToken) return null;

    try {
      const raw = await this.client.refreshAccessToken(this.config, refreshToken);
      return this.tokenManager.saveSession(raw);
    } catch {
      // Refresh failed (token revoked, backend unreachable, etc.) — clear session
      await this.tokenManager.clearSession();
      return null;
    }
  }
}
