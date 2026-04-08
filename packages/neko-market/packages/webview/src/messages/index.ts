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
// Search & Browse
// =============================================================================

export interface MarketSearchQuery {
  text?: string;
  types?: string[];
  tags?: string[];
  page?: number;
  pageSize?: number;
}

export const MarketMessages = {
  /** Signal that webview is ready to receive messages */
  ready: () => postMessage({ type: 'market:ready' }),

  /** Search the marketplace */
  search: (query: MarketSearchQuery) => postMessage({ type: 'market:search', query }),

  /** Get featured packages, optionally filtered by asset type */
  getFeatured: (assetType?: string) => postMessage({ type: 'market:getFeatured', assetType }),

  /** Get a single package by ID */
  getPackage: (packageId: string) => postMessage({ type: 'market:getPackage', packageId }),

  // =============================================================================
  // Install / Uninstall
  // =============================================================================

  /** Install a package */
  install: (packageId: string, version: string) =>
    postMessage({ type: 'market:install', packageId, version }),

  /** Uninstall a package */
  uninstall: (packageId: string) => postMessage({ type: 'market:uninstall', packageId }),

  /** Enable a package */
  enable: (packageId: string) => postMessage({ type: 'market:enable', packageId }),

  /** Disable a package */
  disable: (packageId: string) => postMessage({ type: 'market:disable', packageId }),

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
