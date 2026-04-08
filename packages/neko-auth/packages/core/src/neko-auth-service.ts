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
import { AuthNotConfiguredError, AuthTokenError, AuthNetworkError } from './types';

/** Callback to open a URL in the user's default browser */
export type OpenUrlFn = (url: string) => Promise<void>;

/** Callback invoked after a successful silent token refresh */
export type OnDidRefreshFn = (session: IAuthSession) => void;

export class NekoAuthService implements IAuthProvider {
  private readonly client: OAuthClient;
  private readonly tokenManager: TokenManager;
  private _onDidRefresh?: OnDidRefreshFn;

  constructor(
    storage: ITokenStorage,
    private readonly config: AuthConfig,
    private readonly openUrl: OpenUrlFn,
  ) {
    this.client = new OAuthClient();
    this.tokenManager = new TokenManager(storage);
  }

  /** Register a callback for silent refresh events (NKAT-001) */
  set onDidRefresh(fn: OnDidRefreshFn | undefined) {
    this._onDidRefresh = fn;
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
      const session = await this.tokenManager.saveSession(raw);
      // Notify consumers of silent refresh (NKAT-001)
      this._onDidRefresh?.(session);
      return session;
    } catch (err) {
      // Distinguish token rejection from network errors (NKAT-003)
      if (err instanceof AuthNetworkError) {
        // Network error — don't clear session, return stale session or null
        // The user shouldn't be logged out due to transient network issues
        return this.tokenManager.loadSession();
      }
      if (err instanceof AuthTokenError && err.isTokenInvalid) {
        // Token definitively rejected (401/403) — clear session
        await this.tokenManager.clearSession();
        return null;
      }
      // Unknown error — clear session as a safety measure
      await this.tokenManager.clearSession();
      return null;
    }
  }
}
