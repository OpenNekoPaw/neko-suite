/**
 * MarketShaderService — Discovers and manages marketplace-installed shaders.
 *
 * Responsibilities:
 * 1. Scans ~/.neko/shaders/ for installed + enabled shader packages
 * 2. Subscribes to NekoMarketAPI events for hot-reload
 * 3. Registers shaders with EngineClient for GPU rendering
 * 4. Exposes available shader list + change event for webview consumption
 *
 * Graceful degradation: works without neko-market extension (scan only, no events).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import type { ILogger } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/** Minimal NekoMarketAPI interface (defined locally to avoid cross-extension dependency). */
interface NekoMarketAPI {
  onDidInstall: vscode.Event<MarketAssetEvent>;
  onDidUninstall: vscode.Event<MarketAssetEvent>;
  onDidEnable: vscode.Event<MarketAssetEvent>;
  onDidDisable: vscode.Event<MarketAssetEvent>;
  getInstalled(options?: {
    types?: string[];
    enabledOnly?: boolean;
  }): Promise<Array<{ packageId: string; installedPath: string; enabled: boolean }>>;
}

interface MarketAssetEvent {
  packageId: string;
  type: string;
  installedPath: string;
}

/** Info about a marketplace-installed shader available for use */
export interface MarketShaderInfo {
  packageId: string;
  name: string;
  shaderId: string;
  description?: string;
  category: string;
  wgslPath: string;
  installedPath: string;
}

/** Shader types that this service handles */
const SHADER_TYPES = new Set(['shader', 'shader-preset']);

/** Base directory for marketplace-installed shaders */
const MARKET_SHADERS_BASE = path.join(os.homedir(), '.neko', 'shaders');

const MARKET_EXTENSION_ID = 'neko.neko-market';

// =============================================================================
// Service
// =============================================================================

export class MarketShaderService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _shaders: MarketShaderInfo[] = [];
  private readonly _disposables: vscode.Disposable[] = [];

  get marketShaders(): readonly MarketShaderInfo[] {
    return this._shaders;
  }

  constructor(private readonly _logger: ILogger) {
    this._disposables.push(this._onDidChange);
  }

  /**
   * Initialize: scan existing shaders + subscribe to market events.
   * Safe to call at any time — gracefully handles missing market extension.
   */
  async initialize(): Promise<void> {
    // Initial scan
    await this.rescan();

    // Subscribe to market events if available
    this._subscribeToMarket();
  }

  /** Force rescan ~/.neko/shaders/ and rebuild the shader list */
  async rescan(): Promise<void> {
    try {
      const shaders = await scanShaderDirectory(MARKET_SHADERS_BASE, this._logger);
      this._shaders = shaders;
      this._logger.info(`Market shaders: found ${shaders.length} shader(s)`);
      this._onDidChange.fire();
    } catch (err) {
      this._logger.warn('Failed to scan market shaders', err);
      this._shaders = [];
    }
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private _subscribeToMarket(): void {
    const ext = vscode.extensions.getExtension<NekoMarketAPI>(MARKET_EXTENSION_ID);
    if (!ext) {
      this._logger.debug('neko-market not available, shader hot-reload disabled');
      return;
    }

    const subscribe = (api: NekoMarketAPI): void => {
      this._disposables.push(
        api.onDidInstall((e) => {
          if (SHADER_TYPES.has(e.type)) {
            this._logger.info(`Shader installed: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
        api.onDidUninstall((e) => {
          if (SHADER_TYPES.has(e.type)) {
            this._logger.info(`Shader uninstalled: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
        api.onDidEnable((e) => {
          if (SHADER_TYPES.has(e.type)) {
            this._logger.info(`Shader enabled: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
        api.onDidDisable((e) => {
          if (SHADER_TYPES.has(e.type)) {
            this._logger.info(`Shader disabled: ${e.packageId}, rescanning`);
            this.rescan();
          }
        }),
      );
    };

    if (ext.isActive) {
      subscribe(ext.exports);
    } else {
      // Activate and subscribe when ready
      ext.activate().then(
        (api) => subscribe(api),
        (err) => this._logger.warn('Failed to activate neko-market', err),
      );
    }
  }
}

// =============================================================================
// Scanner
// =============================================================================

/**
 * Scan ~/.neko/shaders/{publisher}/{name}/ for installed shader packages.
 *
 * Each shader package directory is expected to contain:
 * - A .wgsl file (the shader source)
 * - Optionally a manifest.json with metadata
 *
 * Only shaders marked as enabled in the installed registry are included.
 * When no market extension is available, all found shaders are included.
 */
async function scanShaderDirectory(baseDir: string, logger: ILogger): Promise<MarketShaderInfo[]> {
  const shaders: MarketShaderInfo[] = [];

  // Check if base directory exists
  try {
    await fs.access(baseDir);
  } catch {
    return shaders;
  }

  // Get enabled package paths from market API (if available)
  const enabledPaths = await getEnabledShaderPaths(logger);

  // Scan {publisher}/{name}/ structure
  const publishers = await safeReaddir(baseDir);
  for (const publisher of publishers) {
    const publisherDir = path.join(baseDir, publisher);
    const stat = await safeStat(publisherDir);
    if (!stat?.isDirectory()) continue;

    const packages = await safeReaddir(publisherDir);
    for (const pkgName of packages) {
      const pkgDir = path.join(publisherDir, pkgName);
      const pkgStat = await safeStat(pkgDir);
      if (!pkgStat?.isDirectory()) continue;

      // Check if this package is enabled (if we have market info)
      if (enabledPaths !== null && !enabledPaths.has(pkgDir)) {
        continue;
      }

      // Find .wgsl file(s) in the package directory
      const files = await safeReaddir(pkgDir);
      const wgslFiles = files.filter((f) => f.endsWith('.wgsl'));
      if (wgslFiles.length === 0) continue;

      // Read optional manifest
      const manifest = await readManifest(path.join(pkgDir, 'manifest.json'));

      wgslFiles.forEach((wgslFile) => {
        const shaderId = `market:${publisher}/${pkgName}/${path.basename(wgslFile, '.wgsl')}`;
        shaders.push({
          packageId: `@${publisher}/${pkgName}`,
          name: manifest?.name ?? pkgName,
          shaderId,
          description: manifest?.description,
          category: manifest?.category ?? 'market',
          wgslPath: path.join(pkgDir, wgslFile),
          installedPath: pkgDir,
        });
      });
    }
  }

  return shaders;
}

/** Get the set of enabled shader install paths from the market API, or null if not available */
async function getEnabledShaderPaths(logger: ILogger): Promise<Set<string> | null> {
  const ext = vscode.extensions.getExtension<NekoMarketAPI>(MARKET_EXTENSION_ID);
  if (!ext?.isActive) return null;

  try {
    const installed = await ext.exports.getInstalled({
      types: ['shader', 'shader-preset'],
      enabledOnly: true,
    });
    return new Set(installed.map((p) => p.installedPath));
  } catch (err) {
    logger.debug('Failed to get enabled shaders from market', err);
    return null;
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function safeStat(p: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

interface ShaderManifest {
  name?: string;
  description?: string;
  category?: string;
}

async function readManifest(manifestPath: string): Promise<ShaderManifest | null> {
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as ShaderManifest;
  } catch {
    return null;
  }
}
