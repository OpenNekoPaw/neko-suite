/**
 * MarketplaceService — Orchestrates marketplace operations for all asset types.
 *
 * Wraps @neko/market-core and adapts callbacks to vscode.Event.
 * Uses InstallTargetRegistry to support multiple asset types.
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import {
  MarketClient,
  InstallManager,
  CacheManager,
  VersionResolver,
  LicenseManager,
  InstalledRegistry,
  InstallTargetRegistry,
} from '@neko/market-core';
import type {
  MarketSearchQuery,
  MarketSearchResult,
  MarketPackage,
  InstallResult,
  InstallProgress,
  InstalledPackage,
  UpdateInfo,
} from '@neko/shared/types/asset/market';
import type { IAuthSession, ILogger } from '@neko/shared';
import { toBaseError } from '@neko/shared';

import { SkillInstallTarget } from './SkillInstallTarget';

/** Minimal NekoAuthAPI interface (defined locally to avoid cross-extension imports). */
interface NekoAuthAPI {
  getSession(): Promise<IAuthSession | null>;
  onDidChangeSession: (listener: (session: IAuthSession | null) => void) => { dispose(): void };
}

function getNekoAuthAPI(): NekoAuthAPI | undefined {
  return vscode.extensions.getExtension<NekoAuthAPI>('neko.neko-auth')?.exports;
}

/** Neko home directory paths */
const NEKO_HOME = path.join(os.homedir(), '.neko');
const CACHE_DIR = path.join(NEKO_HOME, 'market-cache');
const INSTALLED_FILE = path.join(NEKO_HOME, 'market-installed.json');

export class MarketplaceService implements vscode.Disposable {
  private readonly _client: MarketClient;
  private readonly _installManager: InstallManager;
  private readonly _installedRegistry: InstalledRegistry;
  private readonly _disposables: vscode.Disposable[] = [];

  private readonly _onInstallProgress = new vscode.EventEmitter<InstallProgress>();
  readonly onInstallProgress = this._onInstallProgress.event;

  constructor(private readonly _logger: ILogger) {
    this._client = new MarketClient();
    const cache = new CacheManager(CACHE_DIR);
    const versionResolver = new VersionResolver();
    const license = new LicenseManager();
    this._installedRegistry = new InstalledRegistry(INSTALLED_FILE);

    // Register install targets (add more types here in Phase 6.5.3+)
    const targets = new InstallTargetRegistry();
    targets.register(new SkillInstallTarget());

    this._installManager = new InstallManager(
      this._client,
      cache,
      license,
      versionResolver,
      targets,
      this._installedRegistry,
      { nekoSuiteVersion: '0.0.1' },
    );

    this._installedRegistry.load().catch((err) => {
      this._logger.error('Failed to load installed registry', toBaseError(err));
    });

    this._disposables.push(this._onInstallProgress);
    this.initAuth();
  }

  /** Subscribe to neko-auth session changes and inject Bearer token into MarketClient. */
  private initAuth(): void {
    const auth = getNekoAuthAPI();
    if (!auth) {
      this._logger.debug('neko-auth not available, proceeding unauthenticated');
      return;
    }

    auth
      .getSession()
      .then((session) => {
        this._client.setAuthToken(session?.accessToken ?? null);
        this._logger.debug('Auth session loaded', { authenticated: !!session });
      })
      .catch((err) => {
        this._logger.warn('Failed to load auth session', toBaseError(err));
      });

    const sub = auth.onDidChangeSession((session) => {
      this._client.setAuthToken(session?.accessToken ?? null);
    });
    this._disposables.push(sub);
  }

  // ===========================================================================
  // Search
  // ===========================================================================

  async search(query: MarketSearchQuery): Promise<MarketSearchResult> {
    return this._client.search(query);
  }

  async getFeatured(type?: string): Promise<MarketPackage[]> {
    return this._client.getFeatured(type);
  }

  async getPackage(packageId: string): Promise<MarketPackage | undefined> {
    return this._client.getPackage(packageId);
  }

  // ===========================================================================
  // Install / Uninstall
  // ===========================================================================

  async install(packageId: string, version: string): Promise<InstallResult> {
    this._logger.info(`Installing ${packageId}@${version}`);
    const result = await this._installManager.install(packageId, version, (progress) =>
      this._onInstallProgress.fire(progress),
    );

    if (result.success) {
      this._logger.info(`Installed ${packageId} → ${result.installedPath ?? 'done'}`);
      // Notify neko-agent to rescan skills if command is available (optional, graceful degradation)
      vscode.commands.executeCommand('neko.agent.rescanSkills').then(undefined, () => {
        /* command not available, ignore */
      });
    } else {
      this._logger.warn(`Install failed: ${packageId}`, result.error);
    }

    return result;
  }

  async uninstall(packageId: string): Promise<void> {
    this._logger.info(`Uninstalling ${packageId}`);
    await this._installManager.uninstall(packageId);
    this._logger.info(`Uninstalled ${packageId}`);
    vscode.commands.executeCommand('neko.agent.rescanSkills').then(undefined, () => {
      /* ignore */
    });
  }

  // ===========================================================================
  // Installed Packages
  // ===========================================================================

  async listInstalled(): Promise<InstalledPackage[]> {
    return this._installManager.listInstalled();
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    return this._installManager.checkUpdates();
  }

  // ===========================================================================
  // Disposable
  // ===========================================================================

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}
