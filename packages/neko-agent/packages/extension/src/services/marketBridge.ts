/**
 * VSCode bridge for the unified neko-market extension API.
 *
 * Agent webviews can request marketplace operations, but neko-market owns the
 * package lifecycle. This bridge adapts that extension API to the platform
 * SkillMarketRuntime contract used by ConfigBridge projection code.
 */

import * as vscode from 'vscode';
import type {
  AssetType,
  InstallProgress,
  InstallResult,
  InstalledPackage,
  MarketSearchQuery,
  MarketSearchResult,
  UpdateInfo,
} from '@neko/shared';
import { NEKO_MARKET_EXTENSION_ID } from '@neko-agent/types';
import type { SkillMarketRuntime } from '@neko/platform';

interface NekoMarketAPI {
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;
  install(
    packageId: string,
    version: string,
    onProgress?: (progress: InstallProgress) => void,
  ): Promise<InstallResult>;
  uninstall(packageId: string): Promise<void>;
  getInstalled(options?: {
    types?: AssetType[];
    enabledOnly?: boolean;
  }): Promise<InstalledPackage[]>;
  checkUpdates(): Promise<UpdateInfo[]>;
  getFeatured(type?: AssetType): Promise<MarketSearchResult>;
}

export async function resolveNekoMarketRuntime(): Promise<SkillMarketRuntime | null> {
  try {
    const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
    if (!extension) return null;

    if (!extension.isActive) {
      await extension.activate();
    }

    const api = extension.exports;
    if (!isNekoMarketAPI(api)) return null;

    return {
      search: (query) => api.search({ ...query, types: ['skill'] }),
      install: (packageId, version, onProgress) => api.install(packageId, version, onProgress),
      uninstall: (packageId) => api.uninstall(packageId),
      listInstalled: async () => {
        const installed = await api.getInstalled({ types: ['skill'] });
        return installed.filter((pkg) => pkg.type === 'skill');
      },
      checkUpdates: async () => {
        const [updates, installedSkills] = await Promise.all([
          api.checkUpdates(),
          api.getInstalled({ types: ['skill'] }),
        ]);
        const skillPackageIds = new Set(
          installedSkills.filter((pkg) => pkg.type === 'skill').map((pkg) => pkg.packageId),
        );
        return updates.filter((update) => skillPackageIds.has(update.packageId));
      },
      getFeatured: () => api.getFeatured('skill'),
    };
  } catch {
    return null;
  }
}

function isNekoMarketAPI(value: unknown): value is NekoMarketAPI {
  if (!value || typeof value !== 'object') return false;
  const api = value as Partial<Record<keyof NekoMarketAPI, unknown>>;
  return (
    typeof api.search === 'function' &&
    typeof api.install === 'function' &&
    typeof api.uninstall === 'function' &&
    typeof api.getInstalled === 'function' &&
    typeof api.checkUpdates === 'function' &&
    typeof api.getFeatured === 'function'
  );
}
