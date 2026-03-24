/**
 * @neko/market-core — Marketplace core library for Neko Suite.
 *
 * Layer 0 package: zero vscode dependency.
 * Provides HTTP client, install management, caching, version resolution,
 * and local installed package registry.
 *
 * @example
 * ```typescript
 * import { MarketClient, InstallManager, CacheManager } from '@neko/market-core';
 * ```
 */

// Client
export { MarketClient, MarketApiError } from './client/market-client';
export type { MarketClientConfig } from './client/market-client';

// Install
export { InstallManager } from './install/install-manager';
export type { InstallManagerConfig } from './install/install-manager';
export { InstallTargetRegistry } from './install/install-target';
export { downloadFile } from './install/download-service';
export type { DownloadOptions } from './install/download-service';
export { computeHash, verifyIntegrity } from './install/integrity-checker';
export type { HashAlgorithm, SRIHash } from './install/integrity-checker';

// Cache
export { CacheManager } from './cache/cache-manager';

// Version
export { VersionResolver, parseVersion } from './version/version-resolver';

// License
export { LicenseManager } from './license/license-manager';

// Registry
export { InstalledRegistry } from './registry/installed-registry';
