import type * as vscode from 'vscode';
import type { AssetType, IInstallTarget, InstalledPackage } from '@neko/shared';

export interface GetInstalledOptions {
  readonly types?: readonly AssetType[];
  readonly enabledOnly?: boolean;
}

export interface MarketAssetEvent {
  readonly packageId: string;
  readonly type: AssetType;
  readonly installedPath: string;
  readonly manifest: import('@neko/shared').AssetManifest;
}

export interface NekoMarketAPI {
  readonly onDidInstall?: vscode.Event<MarketAssetEvent>;
  readonly onDidUninstall?: vscode.Event<MarketAssetEvent>;
  readonly onDidEnable?: vscode.Event<MarketAssetEvent>;
  readonly onDidDisable?: vscode.Event<MarketAssetEvent>;
  getInstalled?(options?: GetInstalledOptions): Promise<InstalledPackage[]>;
  registerInstallTarget(target: IInstallTarget, kind?: string): vscode.Disposable;
}

export const NEKO_MARKET_EXTENSION_ID = 'neko.neko-market';
