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
import type { InstalledPackage } from '@neko/shared/types/asset/market';
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
  /** Get installed packages with optional filtering */
  getInstalled(options?: GetInstalledOptions): Promise<InstalledPackage[]>;
  /** Check if a specific package is installed (regardless of enabled state) */
  isInstalled(packageId: string): boolean;
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

  constructor(private readonly service: MarketplaceService) {
    this.onDidInstall = service.onDidInstall;
    this.onDidUninstall = service.onDidUninstall;
    this.onDidEnable = service.onDidEnable;
    this.onDidDisable = service.onDidDisable;
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

  isInstalled(packageId: string): boolean {
    return this.service.isInstalled(packageId);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
