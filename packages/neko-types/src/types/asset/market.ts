/**
 * Market Types — Unified marketplace platform types
 *
 * Core types for the neko-market system:
 * - Search/browsing layer (UI consumption)
 * - Install/management layer (market-core consumption)
 * - License layer (Phase 6.5.4)
 *
 * @see docs/architecture/marketplace.md
 */

import type { AssetManifest, AssetType, AssetCompatibility } from './manifest';

// AssetCompatibility and AssetPricing are defined in manifest.ts
// and re-exported here for convenience
export type { AssetCompatibility, AssetPricing } from './manifest';

// SkillMarketMetadata is defined in manifest.ts (co-located with AssetTypeMetadata)
// and re-exported here for convenience
export type { SkillMarketMetadata } from './manifest';

// =============================================================================
// Search / Browsing
// =============================================================================

/** Sort options for market search */
export type MarketSortField = 'relevance' | 'downloads' | 'rating' | 'updated';

/** Search query for marketplace */
export interface MarketSearchQuery {
  /** Full-text search */
  text?: string;
  /** Filter by asset types */
  types?: AssetType[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by visibility */
  visibility?: ('public' | 'free' | 'paid')[];
  /** Sort field */
  sort?: MarketSortField;
  /** Page number (1-based) */
  page?: number;
  /** Results per page */
  pageSize?: number;
}

/** Paginated search result */
export interface MarketSearchResult {
  items: MarketPackage[];
  total: number;
  hasMore: boolean;
}

/** Install state of a market package */
export type MarketInstallState = 'not-installed' | 'installed' | 'update-available';

/** Market package — wraps AssetManifest with marketplace metadata */
export interface MarketPackage {
  /** Package identifier (@publisher/name) */
  id: string;
  /** Asset manifest with distribution info */
  manifest: AssetManifest;
  /** Current install state */
  installState: MarketInstallState;
  /** Installed version (if installed) */
  installedVersion?: string;
  /** Total download count */
  downloadCount?: number;
}

/** Version entry for a market package */
export interface MarketPackageVersion {
  /** Semantic version */
  version: string;
  /** Release timestamp (ms) */
  releasedAt: number;
  /** Changelog text */
  changelog?: string;
  /** Compatibility requirements */
  compatibility?: AssetCompatibility;
  /** Download size in bytes */
  downloadSize: number;
  /** SRI integrity hash */
  integrity: string;
}

// =============================================================================
// Install / Management
// =============================================================================

/** Install lifecycle phase */
export type InstallPhase =
  | 'downloading'
  | 'verifying'
  | 'validating'
  | 'installing'
  | 'done'
  | 'error';

/** Progress callback payload */
export interface InstallProgress {
  packageId: string;
  phase: InstallPhase;
  /** 0-100 */
  percent: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  error?: string;
}

/** Install operation result */
export interface InstallResult {
  success: boolean;
  installedPath?: string;
  manifest?: AssetManifest;
  error?: string;
}

/** Record of an installed package */
export interface InstalledPackage {
  packageId: string;
  version: string;
  type: AssetType;
  installedAt: number;
  installedPath: string;
  manifest: AssetManifest;
  /** Whether this package is enabled (default: true). Disabled packages remain on disk but are not loaded by consumers. */
  enabled: boolean;
}

/** Update availability info */
export interface UpdateInfo {
  packageId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
}

// =============================================================================
// Progress Callback
// =============================================================================

/** Callback for install progress reporting */
export type InstallProgressCallback = (progress: InstallProgress) => void;

// =============================================================================
// Core Interfaces
// =============================================================================

/**
 * IMarketClient — HTTP API client for marketplace backend.
 *
 * Handles search, package details, version listing, and download URL retrieval.
 * Zero vscode dependency (Layer 0).
 */
export interface IMarketClient {
  /** Search marketplace packages */
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;

  /** Get a single package by ID */
  getPackage(packageId: string): Promise<MarketPackage | undefined>;

  /** Get available versions for a package */
  getVersions(packageId: string): Promise<MarketPackageVersion[]>;

  /** Get download URL for a specific version */
  getDownloadUrl(packageId: string, version: string): Promise<string>;

  /** Get featured/recommended packages */
  getFeatured(type?: AssetType): Promise<MarketPackage[]>;
}

/**
 * IInstallManager — Orchestrates download, verify, and install lifecycle.
 *
 * Progress is reported via callback (not vscode.Event) to maintain Layer 0 constraint.
 */
export interface IInstallManager {
  /** Install a package */
  install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult>;

  /** Uninstall a package */
  uninstall(packageId: string): Promise<void>;

  /** Update a package to a target version */
  update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult>;

  /** List all installed packages */
  listInstalled(): Promise<InstalledPackage[]>;

  /** Check for available updates */
  checkUpdates(): Promise<UpdateInfo[]>;
}

/**
 * IInstallTarget — Type-specific install path strategy.
 *
 * Each asset type provides a target that computes the install location
 * and executes post-install/pre-uninstall hooks.
 */
export interface IInstallTarget<T extends AssetType = AssetType> {
  readonly type: T;

  /** Compute the install path from manifest */
  getInstallPath(manifest: AssetManifest): string;

  /** Post-install hook (e.g., trigger runtime registration) */
  onPostInstall?(manifest: AssetManifest, installedPath: string): Promise<void>;

  /** Pre-uninstall hook (e.g., cleanup runtime registration) */
  onPreUninstall?(manifest: AssetManifest, installedPath: string): Promise<void>;
}

/**
 * ICacheManager — Local download cache management.
 *
 * Manages `.neko/market-cache/` directory with LRU eviction.
 */
export interface ICacheManager {
  /** Get cached file path (undefined if not cached) */
  getCachedPath(packageId: string, version: string): Promise<string | undefined>;

  /** Store a file in cache, returns cache path */
  cacheFile(packageId: string, version: string, sourcePath: string): Promise<string>;

  /** Evict cached entries for a package */
  evict(packageId: string, version?: string): Promise<void>;

  /** Get total cache size in bytes */
  getSize(): Promise<number>;

  /** Prune cache to max size using LRU policy */
  prune(maxSizeBytes: number): Promise<void>;
}

/**
 * IVersionResolver — Semver version resolution utilities.
 */
export interface IVersionResolver {
  /** Check if version satisfies a semver range */
  satisfies(version: string, range: string): boolean;

  /** Find the highest version satisfying a range */
  maxSatisfying(versions: string[], range: string): string | undefined;

  /** Compare two versions: -1 (a<b), 0 (a=b), 1 (a>b) */
  compare(a: string, b: string): -1 | 0 | 1;

  /** Check compatibility with current Neko Suite version */
  isCompatible(compatibility: AssetCompatibility | undefined, currentVersion: string): boolean;
}

/**
 * ILicenseManager — Asset license verification.
 *
 * Phase 1: Stub that passes all free/shared assets.
 * Phase 6.5.4: Full JWT + online verification.
 */
export interface ILicenseManager {
  /** Verify whether the user is entitled to use this asset */
  verify(manifest: AssetManifest): Promise<{ allowed: boolean; reason?: string }>;
}

// =============================================================================
// Installed Registry Persistence
// =============================================================================

/** Persisted installed packages index (stored in ~/.neko/market-installed.json) */
export interface InstalledRegistryData {
  version: number;
  packages: Record<string, InstalledPackage>;
}
