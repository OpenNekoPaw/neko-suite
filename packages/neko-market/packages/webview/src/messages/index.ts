/**
 * MarketMessages — Type-safe postMessage builders for the Marketplace webview.
 *
 * All communication with the Extension Host goes through these helpers.
 */

import { postMessage as postRawMessage } from '@neko/shared/vscode';

function postMessage(msg: unknown): void {
  postRawMessage(msg);
}

// =============================================================================
// Contracts
// =============================================================================

export type AssetCategory = 'media' | 'ai' | 'tooling' | 'bundle';
export type AssetType =
  | 'media'
  | 'starter'
  | 'identity'
  | 'model'
  | 'endpoint'
  | 'provider'
  | 'skill'
  | 'plugin'
  | 'shader'
  | 'preset'
  | 'bundle';
export type MarketSort = 'featured' | 'created' | 'downloads' | 'rating' | 'trending';
export type MarketPricing = 'free' | 'paid' | 'all';
export type CheckoutKind = 'checkout' | 'renew';
export type WorkspaceTrustLevel = 'trusted' | 'restricted' | 'limited';
export type LocalAssetStorageMode = 'copy-managed' | 'local-link';

export interface MarketSearchQuery {
  text?: string;
  types?: AssetType[];
  category?: AssetCategory;
  tags?: string[];
  pricing?: MarketPricing;
  sort?: MarketSort;
  order?: 'asc' | 'desc';
  semantic?: Record<string, string | number | boolean | readonly (string | number | boolean)[]>;
  intent?: Record<string, string | string[] | undefined>;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface MarketServerInfo {
  version: string;
  capabilities: string[];
}

export interface DeveloperModeSettingsRequest {
  enabled: boolean;
  riskAccepted: boolean;
  durationMs?: number;
}

export interface LocalInstallConfirmRequest {
  draftId: string;
  storageMode: LocalAssetStorageMode;
}

export const MarketMessages = {
  /** Signal that webview is ready to receive messages */
  ready: () => postMessage({ type: 'market:ready' }),

  /** Search the marketplace */
  search: (query: MarketSearchQuery) => postMessage({ type: 'market:search', query }),

  /** Get featured packages, optionally filtered by asset type */
  getFeatured: (assetType?: string) => postMessage({ type: 'market:getFeatured', assetType }),

  /** Probe server version and optional endpoint/filter capabilities */
  getServerInfo: () => postMessage({ type: 'market:getServerInfo' }),

  /** Read Developer Mode, Workspace Trust, and sideload management state */
  getGovernanceState: () => postMessage({ type: 'market:getGovernanceState' }),

  /** Get a single package by ID */
  getPackage: (packageId: string) => postMessage({ type: 'market:getPackage', packageId }),

  /** Refresh owned entitlement state */
  refreshEntitlements: (packageId?: string) =>
    postMessage({ type: 'market:refreshEntitlements', packageId }),

  /** List current owned entitlements */
  listEntitlements: () => postMessage({ type: 'market:listEntitlements' }),

  // =============================================================================
  // Install / Lifecycle
  // =============================================================================

  /** Install a package */
  install: (packageId: string, version: string) =>
    postMessage({ type: 'market:install', packageId, version }),

  /** Update a package */
  update: (packageId: string, version: string) =>
    postMessage({ type: 'market:update', packageId, version }),

  /** Uninstall a package */
  uninstall: (packageId: string) => postMessage({ type: 'market:uninstall', packageId }),

  /** Cancel an in-flight package or large asset download */
  cancelInstall: (packageId: string) => postMessage({ type: 'market:cancelInstall', packageId }),

  /** Enable a package */
  enable: (packageId: string) => postMessage({ type: 'market:enable', packageId }),

  /** Disable a package */
  disable: (packageId: string) => postMessage({ type: 'market:disable', packageId }),

  /** Reveal a local package in the host file manager */
  revealLocal: (packageId: string) => postMessage({ type: 'market:revealLocal', packageId }),

  /** Request extension-owned local install file selection */
  requestLocalInstall: (storageMode: LocalAssetStorageMode = 'copy-managed') =>
    postMessage({ type: 'market:requestLocalInstall', storageMode }),

  /** Confirm a previously prepared local install draft */
  confirmLocalInstall: (request: LocalInstallConfirmRequest) =>
    postMessage({ type: 'market:confirmLocalInstall', ...request }),

  /** Cancel a local install draft */
  cancelLocalInstall: (draftId: string) =>
    postMessage({ type: 'market:cancelLocalInstall', draftId }),

  /** Enable or disable expiring native plugin Developer Mode */
  setDeveloperMode: (request: DeveloperModeSettingsRequest) =>
    postMessage({ type: 'market:setDeveloperMode', ...request }),

  /** Promote current workspace through extension-owned trust flow */
  promoteWorkspaceTrust: () => postMessage({ type: 'market:promoteWorkspaceTrust' }),

  /** Open server-owned checkout or renewal flow externally */
  checkout: (packageId: string, kind: CheckoutKind = 'checkout') =>
    postMessage({ type: kind === 'renew' ? 'market:renew' : 'market:checkout', packageId }),

  /** Open server-owned invoice URL externally */
  invoice: (orderId: string) => postMessage({ type: 'market:invoice', orderId }),

  /** Open server-owned support URL externally */
  support: (orderId: string) => postMessage({ type: 'market:support', orderId }),

  // =============================================================================
  // Installed / Updates
  // =============================================================================

  /** List all installed packages */
  listInstalled: () => postMessage({ type: 'market:listInstalled' }),

  /** Check for updates across all installed packages */
  checkUpdates: () => postMessage({ type: 'market:checkUpdates' }),

  // =============================================================================
  // Navigation
  // =============================================================================

  /** Filter by asset type (sent by external commands like neko.market.openSkills) */
  filterByType: (assetType: string | 'all') =>
    postMessage({ type: 'market:filterByType', assetType }),
};
