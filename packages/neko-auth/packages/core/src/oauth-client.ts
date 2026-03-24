/**
 * OAuthClient — Authorization Code + PKCE flow.
 *
 * Designed for public clients (no client secret).
 * The callback server is a temporary localhost HTTP server that receives the
 * redirect from the authorization server after the user logs in.
 */

import type { AuthConfig } from '@neko/shared';
import {
  AuthNotConfiguredError,
  AuthCancelledError,
  AuthTokenError,
  type PKCEChallenge,
  type RawTokenResponse,
  type CallbackResult,
} from './types';

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random PKCE verifier + S256 challenge */
export async function generatePKCE(): Promise<PKCEChallenge> {
  // 32 random bytes → 43-char base64url verifier
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64url(array);

  // SHA-256 of verifier → challenge
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = base64url(new Uint8Array(digest));

  return { verifier, challenge, method: 'S256' };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// OAuthClient
// ---------------------------------------------------------------------------

export class OAuthClient {
  // ---------------------------------------------------------------------------
  // URL construction
  // ---------------------------------------------------------------------------

  /** Build the authorization URL to open in the user's browser */
  buildAuthUrl(config: AuthConfig, pkce: PKCEChallenge, state: string): string {
    if (!config.authUrl) throw new AuthNotConfiguredError();

    const port = config.redirectPort ?? 6419;
    const redirectUri = `http://localhost:${port}/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  // ---------------------------------------------------------------------------
  // Token exchange
  // ---------------------------------------------------------------------------

  /** Exchange an authorization code for tokens */
  async exchangeCode(
    config: AuthConfig,
    code: string,
    verifier: string,
  ): Promise<RawTokenResponse> {
    if (!config.tokenUrl) throw new AuthNotConfiguredError();

    const port = config.redirectPort ?? 6419;
    const redirectUri = `http://localhost:${port}/callback`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    return this.postToken(config.tokenUrl, body);
  }

  /** Exchange a refresh token for new access token */
  async refreshAccessToken(config: AuthConfig, refreshToken: string): Promise<RawTokenResponse> {
    if (!config.tokenUrl) throw new AuthNotConfiguredError();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    });

    return this.postToken(config.tokenUrl, body);
  }

  private async postToken(tokenUrl: string, body: URLSearchParams): Promise<RawTokenResponse> {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new AuthTokenError(`Token request failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<RawTokenResponse>;
  }

  // ---------------------------------------------------------------------------
  // Callback server
  // ---------------------------------------------------------------------------

  /**
   * Start a short-lived localhost HTTP server that waits for the OAuth redirect.
   * Resolves with { code, state } on success, rejects on timeout or cancel.
   */
  startCallbackServer(
    port: number,
    expectedState: string,
    timeoutMs = 120_000,
  ): Promise<CallbackResult> {
    return new Promise<CallbackResult>((resolve, reject) => {
      // Dynamically require 'http' so this file stays importable in browser-like
      // test environments where the module is mocked.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const http = require('node:http') as typeof import('node:http');

      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Login complete — you can close this tab.</h2></body></html>');
        server.close();
        clearTimeout(timer);

        if (error) {
          reject(new AuthCancelledError(`OAuth error: ${error}`));
          return;
        }
        if (!code || !state) {
          reject(new AuthCancelledError('Missing code or state in callback'));
          return;
        }
        if (state !== expectedState) {
          reject(new AuthCancelledError('State mismatch — possible CSRF'));
          return;
        }

        resolve({ code, state });
      });

      server.listen(port);

      const timer = setTimeout(() => {
        server.close();
        reject(new AuthCancelledError('Login timed out'));
      }, timeoutMs);

      server.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
