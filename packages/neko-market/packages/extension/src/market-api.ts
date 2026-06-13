/**
 * NekoMarketAPI — Public API exported by the neko.neko-market extension.
 *
 * Consumers access it via:
 *   vscode.extensions.getExtension<NekoMarketAPI>('neko.neko-market')?.exports
 *
 * Follows the same pattern as NekoAuthAPI (neko-auth).
 */

import * as vscode from 'vscode';
import type { AssetManifest, AssetType } from '@neko/shared/types/asset/manifest';
import type {
  IInstallTarget,
  InstallProgressCallback,
  InstallResult,
  InstalledPackage,
  MarketPackageEvent,
  MarketSearchQuery,
  MarketSearchResult,
  MissingInstallTargetContributor,
  UpdateInfo,
} from '@neko/shared/types/asset/market';
import type { MarketplaceService } from './MarketplaceService';

// =============================================================================
// Event Types
// =============================================================================

/** Payload for install / uninstall / enable / disable events */
export interface MarketAssetEvent {
  packageId: string;
  type: AssetType;
  installedPath: string;
  manifest: AssetManifest;
}

// =============================================================================
// Public API Interface
// =============================================================================

export interface GetInstalledOptions {
  /** Filter by asset type(s) */
  types?: AssetType[];
  /** When true, only return enabled packages (default: false — returns all) */
  enabledOnly?: boolean;
}

/**
 * NekoMarketAPI — the public API exported by the neko.neko-market extension.
 */
export interface NekoMarketAPI {
  /** Fires after a package is successfully installed or updated */
  onDidInstall: vscode.Event<MarketAssetEvent>;
  /** Fires after a package is uninstalled */
  onDidUninstall: vscode.Event<MarketAssetEvent>;
  /** Fires when a package is enabled */
  onDidEnable: vscode.Event<MarketAssetEvent>;
  /** Fires when a package is disabled */
  onDidDisable: vscode.Event<MarketAssetEvent>;
  /** Stable typed market event stream for install, uninstall, update, enable, disable, status, and large asset changes. */
  onDidMarketPackageEvent: vscode.Event<MarketPackageEvent>;
  /** Get installed packages with optional filtering */
  getInstalled(options?: GetInstalledOptions): Promise<InstalledPackage[]>;
  /** Search marketplace packages */
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;
  /** Get featured marketplace packages */
  getFeatured(type?: AssetType): Promise<MarketSearchResult>;
  /** Install a marketplace package */
  install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult>;
  /** Update an installed marketplace package */
  update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult>;
  /** Uninstall a marketplace package */
  uninstall(packageId: string): Promise<void>;
  /** Check available marketplace package updates */
  checkUpdates(): Promise<UpdateInfo[]>;
  /** Check if a specific package is installed (regardless of enabled state) */
  isInstalled(packageId: string): boolean;
  /** Ensure a large/proxy/sparse asset has full-quality bytes before final render/export. */
  ensureFull(packageId: string, itemId?: string): Promise<InstallResult>;
  /** Cancel an in-flight package or large-asset download. */
  cancelInstall(packageId: string): boolean;
  /** Register a contributed Y-class install target. Returns a Disposable registration. */
  registerInstallTarget(target: IInstallTarget, kind?: string): vscode.Disposable;
  /** Inspect live install target routes for diagnostics and tests. */
  getRegisteredInstallTargetTypes(): AssetType[];
  /** Return missing-contributor state for a manifest, if no live target can handle it. */
  getMissingInstallTargetContributor(
    manifest: AssetManifest,
  ): MissingInstallTargetContributor | undefined;
}

// =============================================================================
// Implementation
// =============================================================================

export class NekoMarketAPIImpl implements NekoMarketAPI, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  readonly onDidInstall: vscode.Event<MarketAssetEvent>;
  readonly onDidUninstall: vscode.Event<MarketAssetEvent>;
  readonly onDidEnable: vscode.Event<MarketAssetEvent>;
  readonly onDidDisable: vscode.Event<MarketAssetEvent>;
  readonly onDidMarketPackageEvent: vscode.Event<MarketPackageEvent>;

  constructor(private readonly service: MarketplaceService) {
    this.onDidInstall = service.onDidInstall;
    this.onDidUninstall = service.onDidUninstall;
    this.onDidEnable = service.onDidEnable;
    this.onDidDisable = service.onDidDisable;
    this.onDidMarketPackageEvent = service.onDidMarketPackageEvent;
  }

  async getInstalled(options?: GetInstalledOptions): Promise<InstalledPackage[]> {
    let packages = await this.service.listInstalled();

    if (options?.types && options.types.length > 0) {
      const typeSet = new Set(options.types);
      packages = packages.filter((pkg) => typeSet.has(pkg.type));
    }

    if (options?.enabledOnly) {
      packages = packages.filter((pkg) => pkg.enabled);
    }

    return packages;
  }

  search(query: MarketSearchQuery): Promise<MarketSearchResult> {
    return this.service.search(query);
  }

  async getFeatured(type?: AssetType): Promise<MarketSearchResult> {
    const items = await this.service.getFeatured(type);
    return { items, total: items.length, hasMore: false };
  }

  install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    return this.service.install(packageId, version, onProgress);
  }

  update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    return this.service.update(packageId, version, onProgress);
  }

  uninstall(packageId: string): Promise<void> {
    return this.service.uninstall(packageId);
  }

  checkUpdates(): Promise<UpdateInfo[]> {
    return this.service.checkUpdates();
  }

  isInstalled(packageId: string): boolean {
    return this.service.isInstalled(packageId);
  }

  ensureFull(packageId: string, itemId?: string): Promise<InstallResult> {
    return this.service.ensureFull(packageId, itemId);
  }

  cancelInstall(packageId: string): boolean {
    return this.service.cancelInstall(packageId);
  }

  registerInstallTarget(target: IInstallTarget, kind?: string): vscode.Disposable {
    return this.service.registerInstallTarget(target, undefined, kind);
  }

  getRegisteredInstallTargetTypes(): AssetType[] {
    return this.service.getRegisteredInstallTargetTypes();
  }

  getMissingInstallTargetContributor(
    manifest: AssetManifest,
  ): MissingInstallTargetContributor | undefined {
    return this.service.getMissingInstallTargetContributor(manifest);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
