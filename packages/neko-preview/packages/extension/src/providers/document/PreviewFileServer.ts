/**
 * PreviewFileServer — client for the neko-engine document preview file server.
 *
 * Registers local file paths under opaque UUID tokens so webviews can fetch
 * them via `http://127.0.0.1:{port}/v1/preview/file/{token}` with full HTTP
 * Range request support (206 Partial Content).
 *
 * Usage:
 *   const server = new PreviewFileServer();
 *   const url = await server.registerFile('/path/to/file.pdf');
 *   // → 'http://127.0.0.1:PORT/v1/preview/file/UUID' or throws
 *   await server.unregisterFile(token);
 */

import * as vscode from 'vscode';
import { getLogger } from '../../utils/logger';
import { hasPathVariable, resolvePreviewPath } from './workspacePathResolver';

const logger = getLogger('PreviewFileServer');

/**
 * Error thrown when a path contains an unresolved media/asset library variable.
 * Providers should catch this and show the error HTML instead of opening the file.
 */
export class UnresolvedPathVariableError extends Error {
  constructor(
    public readonly variable: string,
    public readonly originalPath: string,
  ) {
    super(
      `Media library variable "\${${variable}}" is not configured.\n\n` +
        `The file "${originalPath}" references a media library that is not set up on this machine.\n\n` +
        `To fix:\n` +
        `1. Open neko-assets settings (neko/settings.json)\n` +
        `2. Add a media library with variable name "${variable}"\n` +
        `3. Or check that the neko-assets extension is activated`,
    );
    this.name = 'UnresolvedPathVariableError';
  }
}

class PreviewFileServer {
  private _port: number | null = null;

  /**
   * Resolve path variables via neko-assets command.
   * Throws UnresolvedPathVariableError if the variable cannot be expanded.
   */
  private async resolvePath(filePath: string): Promise<string> {
    const resolved = await resolvePreviewPath(filePath);
    if (!hasPathVariable(resolved)) {
      if (resolved !== filePath) {
        logger.info(`Resolved path: ${filePath} → ${resolved}`);
      }
      return resolved;
    }

    // If path still contains a variable, it wasn't resolved — fail early
    const match = filePath.match(/\/?\$\{([^}]+)\}/);
    if (match) {
      throw new UnresolvedPathVariableError(match[1]!, filePath);
    }

    return filePath;
  }

  // ── Engine port ───────────────────────────────────────────────────────────

  /**
   * Ensure the engine HTTP server is running and return its port.
   * Throws if neko-engine is not installed or fails to start.
   */
  async getPort(): Promise<number> {
    if (this._port !== null) return this._port;
    return this._fetchPort();
  }

  /** Invalidate cached port so next getPort() re-queries the engine. */
  invalidatePort(): void {
    this._port = null;
  }

  private async _fetchPort(): Promise<number> {
    const result = await vscode.commands
      .executeCommand<{ port: number } | null>('neko.engine.ensureFrameServer')
      .then(
        (r) => r,
        () => null,
      );

    if (!result?.port) {
      throw new Error(
        'Neko Engine is not running. Please install and activate the neko-engine extension.',
      );
    }

    this._port = result.port;
    return this._port;
  }

  /**
   * Execute a fetch with automatic port retry.
   * If the request fails with a connection error, invalidate the cached port,
   * re-query the engine, and retry once.
   */
  private async _fetchWithRetry(
    buildUrl: (base: string) => string,
    init?: RequestInit,
  ): Promise<Response> {
    const port = await this.getPort();
    const base = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(buildUrl(base), init);
      return res;
    } catch {
      // Connection failed — port may be stale; retry with fresh port
      this.invalidatePort();
      const newPort = await this.getPort();
      const newBase = `http://127.0.0.1:${newPort}`;
      return fetch(buildUrl(newBase), init);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register a local file path with the engine file server.
   * @returns The full `http://127.0.0.1:{port}/v1/preview/file/{token}` URL
   *          (Range-capable; suitable for PDF / CBZ).
   * @throws if the engine is not available.
   */
  async registerFile(filePath: string): Promise<{ url: string; token: string }> {
    const resolved = await this.resolvePath(filePath);
    const body = JSON.stringify({ filePath: resolved });

    const res = await this._fetchWithRetry((base) => `${base}/v1/preview/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      throw new Error(`Failed to register file: ${res.status} ${res.statusText}`);
    }

    const { token } = (await res.json()) as { token: string };
    const port = await this.getPort();
    const url = `http://127.0.0.1:${port}/v1/preview/file/${token}`;
    logger.info(`Registered preview file token=${token} → ${filePath}`);
    return { url, token };
  }

  /**
   * Register an EPUB file and return a directory-style base URL.
   *
   * The returned URL ends with `/` so epub.js detects it as a directory and
   * fetches individual entries on demand via
   * `GET /v1/preview/epub/{token}/{internal-path}`.
   * This avoids downloading the entire (potentially 100 MB) archive up-front.
   *
   * @returns `{ url: 'http://127.0.0.1:{port}/v1/preview/epub/{token}/', token }`
   */
  async registerEpub(filePath: string): Promise<{ url: string; token: string }> {
    const resolved = await this.resolvePath(filePath);
    const body = JSON.stringify({ filePath: resolved });

    const res = await this._fetchWithRetry((base) => `${base}/v1/preview/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      throw new Error(`Failed to register EPUB: ${res.status} ${res.statusText}`);
    }

    const { token } = (await res.json()) as { token: string };
    const port = await this.getPort();
    // Trailing slash → epub.js DIRECTORY mode: fetches entries on demand
    const url = `http://127.0.0.1:${port}/v1/preview/epub/${token}/`;
    logger.info(`Registered EPUB token=${token} → ${filePath}`);
    return { url, token };
  }

  /**
   * Release a previously registered token.
   * Safe to call even if the engine has stopped — errors are swallowed.
   */
  async unregisterFile(token: string): Promise<void> {
    if (this._port === null) return;
    try {
      await this._fetchWithRetry((base) => `${base}/v1/preview/unregister/${token}`, {
        method: 'DELETE',
      });
      logger.info(`Unregistered preview file token=${token}`);
    } catch (err) {
      logger.warn('Failed to unregister preview file token:', err);
    }
  }
}

/** Singleton shared across all document providers in this extension host. */
export const previewFileServer = new PreviewFileServer();
