/**
 * MarketMessages — Type-safe postMessage builders for the Marketplace webview.
 *
 * All communication with the Extension Host goes through these helpers.
 */

// Acquire the VSCode API once (injected by the extension host)
declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };
const vscode = acquireVsCodeApi();

function postMessage(msg: unknown): void {
  vscode.postMessage(msg);
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

export const MarketMessages = {
  /** Signal that webview is ready to receive messages */
  ready: () => postMessage({ type: 'market:ready' }),

  /** Search the marketplace */
  search: (query: MarketSearchQuery) => postMessage({ type: 'market:search', query }),

  /** Get featured packages, optionally filtered by asset type */
  getFeatured: (assetType?: string) => postMessage({ type: 'market:getFeatured', assetType }),

  /** Probe server version and optional endpoint/filter capabilities */
  getServerInfo: () => postMessage({ type: 'market:getServerInfo' }),

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
