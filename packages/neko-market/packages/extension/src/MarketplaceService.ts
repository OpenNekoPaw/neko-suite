/**
 * MarketplaceService — Orchestrates marketplace operations for all asset types.
 *
 * Wraps @neko/market-core and adapts callbacks to vscode.Event.
 * Uses InstallTargetRegistry to support multiple asset types.
 */

import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  MarketClient,
  InstallManager,
  CacheManager,
  VersionResolver,
  LicenseManager,
  InstallTargetRegistry,
  type InstalledPackageRegistry,
} from '@neko/market-core';
import type {
  CheckoutUrlResult,
  EntitlementListResult,
  IInstallTarget,
  MarketSearchQuery,
  MarketSearchResult,
  MarketPackage,
  MarketServerInfo,
  InstallResult,
  InstallProgressCallback,
  InstallProgress,
  InstalledPackage,
  MarketPackageEvent,
  MissingInstallTargetContributor,
  UpdateInfo,
  WorkspaceTrustLevel,
} from '@neko/shared/types/asset/market';
import type { LocalAssetStorageMode } from '@neko/shared/types/asset/manifest';
import type { AssetManifest, AssetType } from '@neko/shared/types/asset/manifest';
import type { IAuthSession, ILogger } from '@neko/shared';
import { toBaseError } from '@neko/shared';

import type { MarketAssetEvent } from './market-api';
import { createBuiltinInstallTargets } from './BuiltinInstallTargets';
import {
  InstallTargetContributionRegistry,
  type InstallTargetDiagnostic,
  type InstallTargetContributorExtension,
} from './install-target-contributions';
import { createMarketLocalMetadataBinding } from './market-local-metadata-binding';

/** Minimal NekoAuthAPI interface (defined locally to avoid cross-extension imports). */
export interface NekoAuthAPI {
  getSession(): Promise<IAuthSession | null>;
  onDidChangeSession: (listener: (session: IAuthSession | null) => void) => { dispose(): void };
}

export interface MarketplaceServiceStoragePaths {
  readonly cacheDir: string;
}

export interface MarketplaceServiceHostAdapters {
  getRegistryUrl(): string | undefined;
  onDidChangeRegistryUrl(listener: (registryUrl: string | undefined) => void): vscode.Disposable;
  getAuthApi(): Promise<NekoAuthAPI | undefined>;
  getExtension(extensionId: string): InstallTargetContributorExtension | undefined;
  listExtensions(): readonly InstallTargetContributorExtension[];
  getExtensionVersion(extensionId: string): string | undefined;
  openExternal(url: string): Promise<boolean>;
  revealLocalPath?(path: string): Promise<void>;
  getLocale(): string;
  getRefreshUri(packageId?: string): string;
  getDeveloperModeState?(): MarketplaceDeveloperModeState;
  setDeveloperModeState?(
    request: MarketplaceDeveloperModeRequest,
  ): Promise<MarketplaceDeveloperModeState>;
  getWorkspaceTrustState?(): MarketplaceWorkspaceTrustState;
  promoteWorkspaceTrust?(): Promise<MarketplaceWorkspaceTrustState>;
  prepareLocalInstallDraft?(
    storageMode: LocalAssetStorageMode,
  ): Promise<MarketplaceLocalInstallDraft | undefined>;
  confirmLocalInstallDraft?(
    draftId: string,
    storageMode: LocalAssetStorageMode,
  ): Promise<InstalledPackage | undefined>;
  cancelLocalInstallDraft?(draftId: string): Promise<void>;
}

export interface MarketplaceServiceOptions {
  readonly storage: MarketplaceServiceStoragePaths;
  readonly installedRegistry: InstalledPackageRegistry;
  readonly disposeStorage?: () => Promise<void>;
  readonly host: MarketplaceServiceHostAdapters;
}

export async function createVSCodeMarketplaceServiceOptions(
  context: vscode.ExtensionContext,
): Promise<MarketplaceServiceOptions> {
  const readTrustState = (): MarketplaceWorkspaceTrustState => ({
    level: vscode.workspace.isTrusted ? 'trusted' : 'restricted',
    canPromote: !vscode.workspace.isTrusted,
    ...(!vscode.workspace.isTrusted
      ? { blockedReason: 'workspace-trust-required-for-high-risk-packages' }
      : {}),
  });
  const metadata = await createMarketLocalMetadataBinding({
    homedir: homedir(),
    getWorkspaceTrustLevel: () => readTrustState().level,
  });
  return {
    storage: {
      cacheDir: vscode.Uri.joinPath(context.globalStorageUri, 'market-cache').fsPath,
    },
    installedRegistry: metadata.registry,
    disposeStorage: () => metadata.dispose(),
    host: {
      getRegistryUrl: readRegistryUrlSetting,
      onDidChangeRegistryUrl: (listener) =>
        vscode.workspace.onDidChangeConfiguration((event) => {
          if (event.affectsConfiguration('neko.market.registryUrl')) {
            listener(readRegistryUrlSetting());
          }
        }),
      getAuthApi: getVSCodeNekoAuthAPI,
      getExtension: (extensionId) =>
        vscode.extensions.getExtension(extensionId) as
          InstallTargetContributorExtension | undefined,
      listExtensions: () => vscode.extensions.all as readonly InstallTargetContributorExtension[],
      getExtensionVersion: (extensionId) => {
        const extension = vscode.extensions.getExtension(extensionId);
        const packageJson = extension?.packageJSON as { version?: unknown } | undefined;
        return typeof packageJson?.version === 'string' ? packageJson.version : undefined;
      },
      openExternal: (url) => Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url))),
      revealLocalPath: (path) =>
        Promise.resolve(
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path)),
        ).then(() => undefined),
      getLocale: () => vscode.env.language,
      getRefreshUri: (packageId) => {
        const query = packageId ? `?packageId=${encodeURIComponent(packageId)}` : '';
        return `vscode://neko.market/refresh${query}`;
      },
      getWorkspaceTrustState: readTrustState,
      promoteWorkspaceTrust: async () => {
        await vscode.commands.executeCommand('workbench.trust.manage');
        return readTrustState();
      },
    },
  };
}

export interface MarketplaceDeveloperModeState {
  enabled: boolean;
  active: boolean;
  expiresAt?: number;
  riskAcceptedAt?: number;
}

export interface MarketplaceDeveloperModeRequest {
  enabled: boolean;
  riskAccepted: boolean;
  durationMs?: number;
}

export interface MarketplaceWorkspaceTrustState {
  level: WorkspaceTrustLevel;
  canPromote: boolean;
  hasProjectHint?: boolean;
  blockedReason?: string;
}

export interface MarketplaceGovernanceState {
  developerMode: MarketplaceDeveloperModeState;
  workspaceTrust: MarketplaceWorkspaceTrustState;
}

export interface MarketplaceLocalInstallDraft {
  draftId: string;
  assetType: AssetType;
  assetName: string;
  sourcePathLabel: string;
  storageMode: LocalAssetStorageMode;
  warnings: Array<{
    code:
      | 'native-plugin'
      | 'shader-validation'
      | 'model-resource'
      | 'local-source'
      | 'workspace-trust'
      | 'developer-mode';
    severity: 'info' | 'warning' | 'blocked';
    message?: string;
  }>;
}

async function getVSCodeNekoAuthAPI(): Promise<NekoAuthAPI | undefined> {
  const ext = vscode.extensions.getExtension<NekoAuthAPI>('neko.neko-auth');
  if (!ext) return undefined;
  if (!ext.isActive) await ext.activate();
  return ext.exports;
}

function readRegistryUrlSetting(): string | undefined {
  return vscode.workspace.getConfiguration('neko.market').get<string>('registryUrl') || undefined;
}

export class MarketplaceService implements vscode.Disposable {
  private readonly _client: MarketClient;
  private readonly _installManager: InstallManager;
  private readonly _installedRegistry: InstalledPackageRegistry;
  private readonly _targetContributions: InstallTargetContributionRegistry;
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

  private readonly _onDidMarketPackageEvent = new vscode.EventEmitter<MarketPackageEvent>();
  readonly onDidMarketPackageEvent = this._onDidMarketPackageEvent.event;

  constructor(
    private readonly _logger: ILogger,
    private readonly _options: MarketplaceServiceOptions,
  ) {
    const registryUrl = this._options.host.getRegistryUrl();
    this._client = new MarketClient(registryUrl ? { registryUrl } : undefined);
    const cache = new CacheManager(this._options.storage.cacheDir);
    const versionResolver = new VersionResolver();
    const license = new LicenseManager();
    this._installedRegistry = this._options.installedRegistry;

    // Register install targets for all supported asset types
    const targets = new InstallTargetRegistry();
    this._targetContributions = new InstallTargetContributionRegistry(targets);
    for (const target of createBuiltinInstallTargets()) {
      this._targetContributions.registerBuiltin(target);
    }

    this._installManager = new InstallManager(
      this._client,
      cache,
      license,
      versionResolver,
      targets,
      this._installedRegistry,
      {
        nekoSuiteVersion: this._options.host.getExtensionVersion('neko.neko-market') ?? '0.0.0',
        downloadTempDir: join(this._options.storage.cacheDir, '.downloads'),
        getWorkspaceTrustLevel: () => this.getGovernanceState().workspaceTrust.level,
      },
    );

    this._disposables.push(
      this._onInstallProgress,
      this._onDidInstall,
      this._onDidUninstall,
      this._onDidEnable,
      this._onDidDisable,
      this._onDidMarketPackageEvent,
      this._targetContributions,
      this._options.host.onDidChangeRegistryUrl((nextRegistryUrl) => {
        this._client.setRegistryUrl(nextRegistryUrl);
        this._logger.info('Marketplace registry URL updated', {
          registryUrl: this._client.getRegistryUrl(),
        });
        this.refreshEntitlements().catch((err) => {
          this._logger.warn(
            'Entitlement refresh after registry URL change failed',
            toBaseError(err),
          );
        });
      }),
    );
    this.initAuth().catch((err) => {
      this._logger.warn('Auth initialization failed', toBaseError(err));
    });
    this.discoverInstallTargetContributions();
  }

  /** Subscribe to neko-auth session changes and inject Bearer token into MarketClient. */
  private async initAuth(): Promise<void> {
    const auth = await this._options.host.getAuthApi();
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

  async getServerInfo(): Promise<MarketServerInfo> {
    return this._client.getServerInfo();
  }

  registerInstallTarget(
    target: IInstallTarget,
    extensionId?: string,
    kind?: string,
  ): vscode.Disposable {
    const disposable = this._targetContributions.registerInstallTarget(target, extensionId, kind);
    this._disposables.push(disposable);
    return disposable;
  }

  resolveInstallTarget(manifest: AssetManifest): IInstallTarget | undefined {
    return this._targetContributions.resolveTarget(manifest);
  }

  getInstallTargetDiagnostics(): InstallTargetDiagnostic[] {
    return this._targetContributions.getDiagnostics();
  }

  getRegisteredInstallTargetTypes(): AssetType[] {
    return this._targetContributions.getRegisteredTypes();
  }

  getMissingInstallTargetContributor(
    manifest: AssetManifest,
  ): MissingInstallTargetContributor | undefined {
    return this._targetContributions.getMissingContributor(manifest);
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
    const pkg = await this._client.getPackage(packageId);
    if (pkg?.manifest) {
      try {
        await this._targetContributions.ensureTarget(pkg.manifest, (extensionId) =>
          this._options.host.getExtension(extensionId),
        );
      } catch (error) {
        const missingContributor = this._targetContributions.getMissingContributor(pkg.manifest);
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message, manifest: pkg.manifest, missingContributor };
      }
    }
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
      this.fireMarketEvent({
        kind: 'install',
        packageId,
        type: result.manifest.type,
        installedPath: result.installedPath,
        manifest: result.manifest,
        enabled: true,
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
      this.fireMarketEvent({
        kind: 'uninstall',
        packageId,
        type: record.type,
        installedPath: record.installedPath,
        manifest: record.manifest,
        enabled: false,
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
    this.fireMarketEvent({
      kind: 'enable',
      packageId,
      type: record.type,
      installedPath: record.installedPath,
      manifest: record.manifest,
      enabled: true,
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
    this.fireMarketEvent({
      kind: 'disable',
      packageId,
      type: record.type,
      installedPath: record.installedPath,
      manifest: record.manifest,
      enabled: false,
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

  getGovernanceState(): MarketplaceGovernanceState {
    return {
      developerMode: this._options.host.getDeveloperModeState?.() ?? {
        enabled: false,
        active: false,
      },
      workspaceTrust: this._options.host.getWorkspaceTrustState?.() ?? {
        level: 'restricted',
        canPromote: false,
        blockedReason: 'workspace-trust-adapter-unavailable',
      },
    };
  }

  async setDeveloperMode(
    request: MarketplaceDeveloperModeRequest,
  ): Promise<MarketplaceDeveloperModeState> {
    if (!request.enabled) {
      return (
        (await this._options.host.setDeveloperModeState?.(request)) ?? {
          enabled: false,
          active: false,
        }
      );
    }
    if (!request.riskAccepted) {
      throw new Error('Developer Mode requires risk acknowledgement');
    }
    return (
      (await this._options.host.setDeveloperModeState?.(request)) ?? {
        enabled: true,
        active: true,
        expiresAt: Date.now() + (request.durationMs ?? 14 * 24 * 60 * 60 * 1000),
        riskAcceptedAt: Date.now(),
      }
    );
  }

  async promoteWorkspaceTrust(): Promise<MarketplaceWorkspaceTrustState> {
    const promote = this._options.host.promoteWorkspaceTrust;
    if (!promote) {
      throw new Error('Workspace trust promotion is unavailable in this Host');
    }
    return promote();
  }

  async prepareLocalInstallDraft(
    storageMode: LocalAssetStorageMode,
  ): Promise<MarketplaceLocalInstallDraft | undefined> {
    return this._options.host.prepareLocalInstallDraft?.(storageMode);
  }

  async confirmLocalInstallDraft(
    draftId: string,
    storageMode: LocalAssetStorageMode,
  ): Promise<InstalledPackage | undefined> {
    return this._options.host.confirmLocalInstallDraft?.(draftId, storageMode);
  }

  async cancelLocalInstallDraft(draftId: string): Promise<void> {
    await this._options.host.cancelLocalInstallDraft?.(draftId);
  }

  async revealLocalPackage(packageId: string): Promise<void> {
    const record = this._installedRegistry.get(packageId);
    if (!record) throw new Error(`Package is not installed: ${packageId}`);
    if (record.source?.kind !== 'local' && record.source?.kind !== 'local-link') {
      throw new Error(`Package is not a local install: ${packageId}`);
    }
    await this._options.host.revealLocalPath?.(record.installedPath);
  }

  async update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    const previous = this._installedRegistry.get(packageId);
    const result = await this._installManager.update(packageId, version, (progress) => {
      this._onInstallProgress.fire(progress);
      onProgress?.(progress);
    });

    if (result.success && result.manifest && result.installedPath) {
      const current = this._installedRegistry.get(packageId);
      this.fireMarketEvent({
        kind: 'update',
        packageId,
        type: result.manifest.type,
        installedPath: result.installedPath,
        manifest: result.manifest,
        enabled: current?.enabled,
        status: current?.status,
        previousStatus: previous?.status,
      });
      if (previous?.status !== current?.status) {
        this.fireMarketEvent({
          kind: 'status-change',
          packageId,
          type: result.manifest.type,
          installedPath: result.installedPath,
          manifest: result.manifest,
          enabled: current?.enabled,
          status: current?.status,
          previousStatus: previous?.status,
        });
      }
    }

    return result;
  }

  async ensureFull(packageId: string, itemId?: string): Promise<InstallResult> {
    const result = await this._installManager.ensureFull(packageId, itemId);
    if (result.success && result.manifest && result.installedPath) {
      const record = this._installedRegistry.get(packageId);
      this.fireMarketEvent({
        kind: 'large-asset-state-change',
        packageId,
        type: result.manifest.type,
        installedPath: result.installedPath,
        manifest: result.manifest,
        enabled: record?.enabled,
        status: record?.status,
        largeAsset: record?.largeAsset,
      });
    }
    return result;
  }

  cancelInstall(packageId: string): boolean {
    const cancelled = this._installManager.cancelInstall(packageId);
    if (cancelled) {
      this._onInstallProgress.fire({
        packageId,
        phase: 'error',
        percent: 0,
        error: 'cancelled',
      });
    }
    return cancelled;
  }

  async listEntitlements(): Promise<EntitlementListResult> {
    return this._client.listEntitlements();
  }

  async refreshEntitlements(packageId?: string): Promise<EntitlementListResult> {
    const result = await this._client.refreshEntitlements();
    if (packageId) {
      await this._client.getPackage(packageId).catch((err) => {
        this._logger.warn(
          `Package detail refresh failed after entitlement refresh: ${packageId}`,
          toBaseError(err),
        );
      });
    }
    return result;
  }

  async openCheckout(packageId: string): Promise<CheckoutUrlResult> {
    const checkout = await this._client.getCheckoutUrl(
      packageId,
      this._options.host.getRefreshUri(packageId),
      this._options.host.getLocale(),
    );
    await this._options.host.openExternal(checkout.url);
    return checkout;
  }

  async openRenewal(packageId: string): Promise<CheckoutUrlResult> {
    return this.openCheckout(packageId);
  }

  async openInvoice(orderId: string): Promise<void> {
    await this._options.host.openExternal(this.buildServerDeepLink('billing/invoices', orderId));
  }

  async openSupport(orderId: string): Promise<void> {
    await this._options.host.openExternal(this.buildServerDeepLink('support/orders', orderId));
  }

  // ===========================================================================
  // Disposable
  // ===========================================================================

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    void this._options.disposeStorage?.().catch((error: unknown) => {
      this._logger.error('Failed to dispose Market local metadata storage', toBaseError(error));
    });
  }

  private discoverInstallTargetContributions(): void {
    this._targetContributions.discover(this._options.host.listExtensions());
  }

  private fireMarketEvent(event: MarketPackageEvent): void {
    this._onDidMarketPackageEvent.fire(event);
  }

  private buildServerDeepLink(path: string, id: string): string {
    const baseUrl = this._client
      .getRegistryUrl()
      .replace(/\/api\/v1\/?$/, '')
      .replace(/\/$/, '');
    return `${baseUrl}/${path}/${encodeURIComponent(id)}`;
  }
}
