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
import { EngineClient, type RegisteredFile } from '@neko/neko-client';
import { getLogger } from '../../utils/logger';
import {
  getPreviewAllowedRoots,
  hasPathVariable,
  type PreviewPathResolutionOptions,
  resolvePreviewPath,
} from './workspacePathResolver';

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
  private _client: EngineClient | null = null;

  /**
   * Resolve path variables via neko-assets command.
   * Throws UnresolvedPathVariableError if the variable cannot be expanded.
   */
  private async resolvePath(
    filePath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<string> {
    const resolved = await resolvePreviewPath(filePath, options);
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
    await this.syncAllowedRoots(await this.buildAllowedRoots());
    if (this._port !== null) return this._port;
    return this._fetchPort();
  }

  /** Invalidate cached port so next getPort() re-queries the engine. */
  invalidatePort(): void {
    this._port = null;
    this._client = null;
  }

  private async _fetchPort(): Promise<number> {
    const previewAllowedRoots = await this.buildAllowedRoots();
    const result = await vscode.commands
      .executeCommand<{ port: number } | null>('neko.engine.ensureFrameServer', previewAllowedRoots)
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

  private async buildAllowedRoots(): Promise<string[]> {
    return getPreviewAllowedRoots();
  }

  private async syncAllowedRoots(previewAllowedRoots: string[]): Promise<void> {
    if (this._port === null) return;
    await Promise.resolve(
      vscode.commands.executeCommand('neko.engine.ensureFrameServer', previewAllowedRoots),
    ).then(
      () => undefined,
      () => undefined,
    );
  }

  private async getClient(): Promise<EngineClient> {
    const port = await this.getPort();
    if (!this._client || this._client.port !== port) {
      this._client = new EngineClient(port);
    }
    return this._client;
  }

  /** Execute an EngineClient operation with automatic stale-port retry. */
  private async withClientRetry<T>(task: (client: EngineClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      return await task(client);
    } catch {
      this.invalidatePort();
      const retryClient = await this.getClient();
      return task(retryClient);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register a local file path with the engine file server.
   * @returns The full `http://127.0.0.1:{port}/v1/preview/file/{token}` URL
   *          (Range-capable; suitable for PDF / CBZ).
   * @throws if the engine is not available.
   */
  async registerFile(
    filePath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<{ url: string; token: string }> {
    const resolved = await this.resolvePath(filePath, options);
    const registered = await this.registerEngineFile(resolved, 'document');
    const { token } = registered;
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
  async registerEpub(
    filePath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<{ url: string; token: string }> {
    const resolved = await this.resolvePath(filePath, options);
    const registered = await this.registerEngineFile(resolved, 'document');
    const { token } = registered;
    const port = await this.getPort();
    // Trailing slash → epub.js DIRECTORY mode: fetches entries on demand
    const url = `http://127.0.0.1:${port}/v1/preview/epub/${token}/`;
    logger.info(`Registered EPUB token=${token} → ${filePath}`);
    return { url, token };
  }

  /**
   * Read a byte range through the engine preview file server.
   *
   * Binary preview probes should use this instead of VSCode or Node file APIs so
   * local file access stays behind the neko-engine token boundary.
   */
  async readRange(
    filePath: string,
    start: number,
    end: number,
    options?: PreviewPathResolutionOptions,
  ): Promise<ArrayBuffer> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new Error(`Invalid preview file byte range: ${start}-${end}`);
    }

    const resolved = await this.resolvePath(filePath, options);
    return this.withClientRetry((client) =>
      client.withRegisteredFile({ filePath: resolved, purpose: 'document' }, (registered) =>
        client.readFileRange(registered.token, start, end),
      ),
    );
  }

  /**
   * Register an EPUB once, run a task that reads entries through neko-engine,
   * then release the token. The task receives raw entry bytes; parsing stays in
   * the extension layer while binary file access stays in the engine.
   */
  async withEpubEntryReader<T>(
    filePath: string,
    task: (readEntry: (entryPath: string) => Promise<ArrayBuffer>) => Promise<T>,
    options?: PreviewPathResolutionOptions,
  ): Promise<T> {
    const { token } = await this.registerEpub(filePath, options);
    try {
      return await task((entryPath) => this.readRegisteredEpubEntry(token, entryPath));
    } finally {
      await this.unregisterFile(token);
    }
  }

  /** Read one EPUB/ZIP entry through neko-engine. */
  async readEpubEntry(
    filePath: string,
    entryPath: string,
    options?: PreviewPathResolutionOptions,
  ): Promise<ArrayBuffer> {
    return this.withEpubEntryReader(filePath, (readEntry) => readEntry(entryPath), options);
  }

  /**
   * Release a previously registered token.
   * Safe to call even if the engine has stopped — errors are swallowed.
   */
  async unregisterFile(token: string): Promise<void> {
    if (this._port === null) return;
    try {
      await this.withClientRetry((client) => client.unregisterFile(token));
      logger.info(`Unregistered preview file token=${token}`);
    } catch (err) {
      logger.warn('Failed to unregister preview file token:', err);
    }
  }

  private async readRegisteredEpubEntry(token: string, entryPath: string): Promise<ArrayBuffer> {
    return this.withClientRetry((client) => client.readFileEntry(token, entryPath));
  }

  private async registerEngineFile(
    filePath: string,
    purpose: 'document' | 'preview',
  ): Promise<RegisteredFile> {
    return this.withClientRetry((client) => client.registerFile({ filePath, purpose }));
  }
}

/** Singleton shared across all document providers in this extension host. */
export const previewFileServer = new PreviewFileServer();
