/**
 * Internal runtime types for @neko/auth-core.
 * Error classes, storage keys, and PKCE data structures.
 */

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class AuthNotConfiguredError extends Error {
  readonly code = 'AUTH_NOT_CONFIGURED' as const;

  constructor(message = 'Neko auth endpoint is not configured') {
    super(message);
    this.name = 'AuthNotConfiguredError';
  }
}

export class AuthCancelledError extends Error {
  readonly code = 'AUTH_CANCELLED' as const;

  constructor(message = 'Authentication was cancelled by the user') {
    super(message);
    this.name = 'AuthCancelledError';
  }
}

export class AuthTokenError extends Error {
  readonly code = 'AUTH_TOKEN_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AuthTokenError';
  }
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const StorageKeys = {
  SESSION: 'neko.auth.session',
  REFRESH_TOKEN: 'neko.auth.refresh',
} as const;

// ---------------------------------------------------------------------------
// OAuth internal types
// ---------------------------------------------------------------------------

export interface PKCEChallenge {
  verifier: string;
  challenge: string;
  method: 'S256';
}

/** Raw token response from the authorization server */
export interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
  /** Neko-specific fields */
  user?: string;
  plan?: string;
  usage?: number;
}

/** Callback server result after receiving the OAuth redirect */
export interface CallbackResult {
  code: string;
  state: string;
}
