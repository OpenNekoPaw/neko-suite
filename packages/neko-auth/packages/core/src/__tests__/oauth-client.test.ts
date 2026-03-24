import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { generatePKCE, OAuthClient } from '../oauth-client';
import { AuthNotConfiguredError, AuthCancelledError, AuthTokenError } from '../types';
import type { AuthConfig } from '@neko/shared';

// ---------------------------------------------------------------------------
// Mock config
// ---------------------------------------------------------------------------

const mockConfig: AuthConfig = {
  clientId: 'test-client',
  authUrl: 'https://auth.example.com/oauth/authorize',
  tokenUrl: 'https://auth.example.com/oauth/token',
  scopes: ['read', 'write'],
  redirectPort: 6419,
};

/** Make a real HTTP GET to a localhost server (bypasses any fetch mock) */
function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// generatePKCE
// ---------------------------------------------------------------------------

describe('generatePKCE', () => {
  it('returns verifier, challenge, and method S256', async () => {
    const pkce = await generatePKCE();

    expect(pkce.method).toBe('S256');
    expect(typeof pkce.verifier).toBe('string');
    expect(typeof pkce.challenge).toBe('string');
  });

  it('verifier is base64url (no +, /, =)', async () => {
    const pkce = await generatePKCE();
    expect(pkce.verifier).not.toMatch(/[+/=]/);
    expect(pkce.challenge).not.toMatch(/[+/=]/);
  });

  it('generates different values on each call', async () => {
    const a = await generatePKCE();
    const b = await generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('verifier length is 43 chars (32 random bytes → base64url)', async () => {
    const pkce = await generatePKCE();
    expect(pkce.verifier.length).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// OAuthClient.buildAuthUrl
// ---------------------------------------------------------------------------

describe('OAuthClient.buildAuthUrl', () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient();
  });

  it('builds a valid URL with all required params', async () => {
    const pkce = await generatePKCE();
    const state = 'test-state-123';
    const url = client.buildAuthUrl(mockConfig, pkce, state);

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('test-client');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:6419/callback');
    expect(parsed.searchParams.get('scope')).toBe('read write');
    expect(parsed.searchParams.get('state')).toBe(state);
    expect(parsed.searchParams.get('code_challenge')).toBe(pkce.challenge);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('uses default port 6419 when redirectPort is not set', async () => {
    const config: AuthConfig = { ...mockConfig, redirectPort: undefined };
    const pkce = await generatePKCE();
    const url = client.buildAuthUrl(config, pkce, 'state');
    // Check decoded redirect_uri param (not raw percent-encoded URL string)
    const parsed = new URL(url);
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:6419/callback');
  });

  it('throws AuthNotConfiguredError when authUrl is empty', async () => {
    const config: AuthConfig = { ...mockConfig, authUrl: '' };
    const pkce = await generatePKCE();
    expect(() => client.buildAuthUrl(config, pkce, 'state')).toThrow(AuthNotConfiguredError);
  });
});

// ---------------------------------------------------------------------------
// OAuthClient.exchangeCode
// ---------------------------------------------------------------------------

describe('OAuthClient.exchangeCode', () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts correct body and returns token response', async () => {
    const mockToken = {
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockToken,
    } as Response);

    const result = await client.exchangeCode(mockConfig, 'auth-code', 'verifier-xyz');

    expect(result).toEqual(mockToken);
    expect(fetch).toHaveBeenCalledOnce();

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(mockConfig.tokenUrl);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });

    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('test-client');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe('verifier-xyz');
    expect(body.get('redirect_uri')).toBe('http://localhost:6419/callback');
  });

  it('throws AuthTokenError on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid_client',
    } as Response);

    await expect(client.exchangeCode(mockConfig, 'bad-code', 'verifier')).rejects.toThrow(
      AuthTokenError,
    );
  });

  it('throws AuthNotConfiguredError when tokenUrl is empty', async () => {
    const config: AuthConfig = { ...mockConfig, tokenUrl: '' };
    await expect(client.exchangeCode(config, 'code', 'verifier')).rejects.toThrow(
      AuthNotConfiguredError,
    );
  });
});

// ---------------------------------------------------------------------------
// OAuthClient.refreshAccessToken
// ---------------------------------------------------------------------------

describe('OAuthClient.refreshAccessToken', () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts refresh_token grant and returns new tokens', async () => {
    const mockToken = {
      access_token: 'new-access',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockToken,
    } as Response);

    const result = await client.refreshAccessToken(mockConfig, 'refresh-token-xyz');

    expect(result).toEqual(mockToken);
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-token-xyz');
  });
});

// ---------------------------------------------------------------------------
// OAuthClient.startCallbackServer
// ---------------------------------------------------------------------------

describe('OAuthClient.startCallbackServer', () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient();
  });

  it('resolves with code and state on valid callback', async () => {
    const port = 16419;
    const state = 'test-state-abc';
    const serverPromise = client.startCallbackServer(port, state, 5000);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const res = await httpGet(`http://localhost:${port}/callback?code=mycode&state=${state}`);
    expect(res.status).toBe(200);

    const result = await serverPromise;
    expect(result.code).toBe('mycode');
    expect(result.state).toBe(state);
  });

  it('rejects on state mismatch (CSRF protection)', async () => {
    const port = 16420;
    // Attach rejection handler BEFORE making the HTTP request to avoid unhandled rejection
    const serverPromise = client.startCallbackServer(port, 'expected-state', 5000);
    const rejectExpectation = expect(serverPromise).rejects.toThrow(AuthCancelledError);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    await httpGet(`http://localhost:${port}/callback?code=mycode&state=wrong-state`);

    await rejectExpectation;
  });

  it('rejects on OAuth error parameter', async () => {
    const port = 16421;
    const serverPromise = client.startCallbackServer(port, 'state', 5000);
    const rejectExpectation = expect(serverPromise).rejects.toThrow(AuthCancelledError);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    await httpGet(`http://localhost:${port}/callback?error=access_denied`);

    await rejectExpectation;
  });

  it('rejects on timeout', async () => {
    const port = 16422;
    const serverPromise = client.startCallbackServer(port, 'state', 100);
    await expect(serverPromise).rejects.toThrow(AuthCancelledError);
  });

  it('returns 404 for non-callback paths', async () => {
    const port = 16423;
    const state = 'test-state-404';
    const serverPromise = client.startCallbackServer(port, state, 5000);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const res = await httpGet(`http://localhost:${port}/other`);
    expect(res.status).toBe(404);

    // Clean up: send valid callback to resolve server
    await httpGet(`http://localhost:${port}/callback?code=c&state=${state}`);
    await serverPromise;
  });
});
