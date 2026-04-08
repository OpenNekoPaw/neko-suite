import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p }) },
  commands: { executeCommand: vi.fn() },
  window: { showErrorMessage: vi.fn() },
  EventEmitter: vi.fn(),
}));

import { AuthTokenError, AuthNetworkError } from '@neko/auth-core';

// ============================================================================
// Tests
// ============================================================================

describe('AuthTokenError — isTokenInvalid getter', () => {
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

describe('AuthNetworkError — distinct error type', () => {
  it('has AUTH_NETWORK_ERROR code', () => {
    const err = new AuthNetworkError('Connection refused');

    expect(err.code).toBe('AUTH_NETWORK_ERROR');
    expect(err.name).toBe('AuthNetworkError');
    expect(err.message).toBe('Connection refused');
  });
});

describe('Error type discrimination', () => {
  it('can distinguish token errors from network errors by code', () => {
    const errors: Array<AuthTokenError | AuthNetworkError> = [
      new AuthTokenError('Token expired', 401),
      new AuthNetworkError('DNS resolution failed'),
    ];

    const tokenErrors = errors.filter((e): e is AuthTokenError => e.code === 'AUTH_TOKEN_ERROR');
    const networkErrors = errors.filter(
      (e): e is AuthNetworkError => e.code === 'AUTH_NETWORK_ERROR',
    );

    expect(tokenErrors).toHaveLength(1);
    expect(networkErrors).toHaveLength(1);
    expect(tokenErrors[0]?.isTokenInvalid).toBe(true);
  });
});
