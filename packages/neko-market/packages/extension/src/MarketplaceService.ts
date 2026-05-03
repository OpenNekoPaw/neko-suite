/**
 * MarketplaceService — Orchestrates marketplace operations for all asset types.
 *
 * Wraps @neko/market-core and adapts callbacks to vscode.Event.
 * Uses InstallTargetRegistry to support multiple asset types.
 */

import * as vscode from 'vscode';
// os import removed — paths resolved via resolveGlobalStorageLayout()
import * as path from 'path';
import {
  MarketClient,
  InstallManager,
  CacheManager,
  VersionResolver,
  LicenseManager,
  InstalledRegistry,
  InstallTargetRegistry,
  SkillInstallTarget,
} from '@neko/market-core';
import type {
  MarketSearchQuery,
  MarketSearchResult,
  MarketPackage,
  InstallResult,
  InstallProgressCallback,
  InstallProgress,
  InstalledPackage,
  UpdateInfo,
} from '@neko/shared/types/asset/market';
import type { AssetType } from '@neko/shared/types/asset/manifest';
import type { IAuthSession, ILogger } from '@neko/shared';
import { toBaseError } from '@neko/shared';

import type { MarketAssetEvent } from './market-api';
import { ShaderInstallTarget } from './ShaderInstallTarget';
import { ModelInstallTarget } from './ModelInstallTarget';
import { PresetInstallTarget } from './PresetInstallTarget';
import { PuppetMotionInstallTarget } from './PuppetMotionInstallTarget';
import { ProviderCardInstallTarget } from './ProviderCardInstallTarget';

/** Minimal NekoAuthAPI interface (defined locally to avoid cross-extension imports). */
interface NekoAuthAPI {
  getSession(): Promise<IAuthSession | null>;
  onDidChangeSession: (listener: (session: IAuthSession | null) => void) => { dispose(): void };
}

async function getNekoAuthAPI(): Promise<NekoAuthAPI | undefined> {
  const ext = vscode.extensions.getExtension<NekoAuthAPI>('neko.neko-auth');
  if (!ext) return undefined;
  if (!ext.isActive) await ext.activate();
  return ext.exports;
}

/** Neko home directory paths — resolved via global storage layout */
import * as os from 'os';
import { resolveGlobalStorageLayout } from '@neko/shared';
const _globalLayout = resolveGlobalStorageLayout(os.homedir());
const NEKO_HOME = _globalLayout.root;
const CACHE_DIR = _globalLayout.marketCache;
const INSTALLED_FILE = _globalLayout.marketInstalled;

export class MarketplaceService implements vscode.Disposable {
  private readonly _client: MarketClient;
  private readonly _installManager: InstallManager;
  private readonly _installedRegistry: InstalledRegistry;
  private readonly _disposables: vscode.Disposable[] = [];

  // Progress events (webview consumption)
  private readonly _onInstallProgress = new vscode.EventEmitter<InstallProgress>();
  readonly onInstallProgress = this._onInstallProgress.event;

  // Public API events (cross-extension consumption)
  private readonly _onDidInstall = new vscode.EventEmitter<MarketAssetEvent>();
  readonly onDidInstall = this._onDidInstall.event;

  private readonly _onDidUninstall = new vscode.EventEmitter<MarketAssetEvent>();
  readonly onDidUninstall = this._onDidUninstall.event;

  private readonly _onDidEnable = new vscode.EventEmitter<MarketAssetEvent>();
  readonly onDidEnable = this._onDidEnable.event;

  private readonly _onDidDisable = new vscode.EventEmitter<MarketAssetEvent>();
  readonly onDidDisable = this._onDidDisable.event;

  constructor(private readonly _logger: ILogger) {
    // Read registry URL from config: VSCode settings > config.json > default
    const registryUrl =
      vscode.workspace.getConfiguration('neko.market').get<string>('registryUrl') || undefined;
    this._client = new MarketClient(registryUrl ? { registryUrl } : undefined);
    const cache = new CacheManager(CACHE_DIR);
    const versionResolver = new VersionResolver();
    const license = new LicenseManager();
    this._installedRegistry = new InstalledRegistry(INSTALLED_FILE);

    // Register install targets for all supported asset types
    const targets = new InstallTargetRegistry();
    targets.register(new SkillInstallTarget());
    targets.register(new ShaderInstallTarget('shader'));
    targets.register(new ShaderInstallTarget('shader-preset'));
    targets.register(new ModelInstallTarget('ai-model'));
    targets.register(new ModelInstallTarget('lora'));
    targets.register(new ModelInstallTarget('embedding'));
    targets.register(new PresetInstallTarget('preset'));
    targets.register(new PresetInstallTarget('template'));
    targets.register(new PresetInstallTarget('lut'));
    targets.register(new PuppetMotionInstallTarget());
    targets.register(new ProviderCardInstallTarget());

    this._installManager = new InstallManager(
      this._client,
      cache,
      license,
      versionResolver,
      targets,
      this._installedRegistry,
      {
        nekoSuiteVersion:
          vscode.extensions.getExtension('neko.neko-market')?.packageJSON?.version ?? '0.0.0',
      },
    );

    this._installedRegistry.load().catch((err) => {
      this._logger.error('Failed to load installed registry', toBaseError(err));
    });

    this._disposables.push(
      this._onInstallProgress,
      this._onDidInstall,
      this._onDidUninstall,
      this._onDidEnable,
      this._onDidDisable,
    );
    this.initAuth().catch((err) => {
      this._logger.warn('Auth initialization failed', toBaseError(err));
    });
  }

  /** Subscribe to neko-auth session changes and inject Bearer token into MarketClient. */
  private async initAuth(): Promise<void> {
    const auth = await getNekoAuthAPI();
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

  async getFeatured(type?: AssetType): Promise<MarketPackage[]> {
    return this._client.getFeatured(type);
  }

  async getPackage(packageId: string): Promise<MarketPackage | undefined> {
    return this._client.getPackage(packageId);
  }

  // ===========================================================================
  // Install / Uninstall
  // ===========================================================================

  async install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    this._logger.info(`Installing ${packageId}@${version}`);
    const result = await this._installManager.install(packageId, version, (progress) => {
      this._onInstallProgress.fire(progress);
      onProgress?.(progress);
    });

    if (result.success && result.manifest && result.installedPath) {
      this._logger.info(`Installed ${packageId} → ${result.installedPath}`);

      this._onDidInstall.fire({
        packageId,
        type: result.manifest.type,
        installedPath: result.installedPath,
        manifest: result.manifest,
      });

      // Notify neko-agent to rescan skills if command is available (optional, graceful degradation)
      vscode.commands.executeCommand('neko.agent.rescanSkills').then(undefined, () => {
        /* command not available, ignore */
      });
    } else if (!result.success) {
      this._logger.warn(`Install failed: ${packageId}`, result.error);
    }

    return result;
  }

  async uninstall(packageId: string): Promise<void> {
    this._logger.info(`Uninstalling ${packageId}`);

    // Capture package info before removal for the event
    const record = this._installedRegistry.get(packageId);

    await this._installManager.uninstall(packageId);
    this._logger.info(`Uninstalled ${packageId}`);

    if (record) {
      this._onDidUninstall.fire({
        packageId,
        type: record.type,
        installedPath: record.installedPath,
        manifest: record.manifest,
      });
    }

    vscode.commands.executeCommand('neko.agent.rescanSkills').then(undefined, () => {
      /* ignore */
    });
  }

  // ===========================================================================
  // Enable / Disable
  // ===========================================================================

  async enable(packageId: string): Promise<void> {
    const record = this._installedRegistry.get(packageId);
    if (!record) {
      this._logger.warn(`Cannot enable: package not installed: ${packageId}`);
      return;
    }

    await this._installedRegistry.setEnabled(packageId, true);
    this._logger.info(`Enabled ${packageId}`);

    this._onDidEnable.fire({
      packageId,
      type: record.type,
      installedPath: record.installedPath,
      manifest: record.manifest,
    });
  }

  async disable(packageId: string): Promise<void> {
    const record = this._installedRegistry.get(packageId);
    if (!record) {
      this._logger.warn(`Cannot disable: package not installed: ${packageId}`);
      return;
    }

    await this._installedRegistry.setEnabled(packageId, false);
    this._logger.info(`Disabled ${packageId}`);

    this._onDidDisable.fire({
      packageId,
      type: record.type,
      installedPath: record.installedPath,
      manifest: record.manifest,
    });
  }

  // ===========================================================================
  // Installed Packages
  // ===========================================================================

  async listInstalled(): Promise<InstalledPackage[]> {
    return this._installManager.listInstalled();
  }

  /** Check if a package is installed (regardless of enabled state) */
  isInstalled(packageId: string): boolean {
    return this._installedRegistry.has(packageId);
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
