/**
 * InstallManager — Orchestrates the full install lifecycle.
 *
 * Flow: download → verify → install → register
 *
 * Composes: IMarketClient, ICacheManager, ILicenseManager,
 *           IVersionResolver, IntegrityChecker, InstallTargetRegistry,
 *           InstalledRegistry.
 */

import { mkdir, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type {
  IInstallManager,
  IMarketClient,
  ICacheManager,
  ILicenseManager,
  IVersionResolver,
  InstallResult,
  InstallProgressCallback,
  InstalledPackage,
  UpdateInfo,
} from '@neko/shared/types/asset/market';

import { verifyIntegrity } from './integrity-checker';
import { downloadFile } from './download-service';
import type { InstallTargetRegistry } from './install-target';
import type { InstalledRegistry } from '../registry/installed-registry';

// =============================================================================
// Configuration
// =============================================================================

export interface InstallManagerConfig {
  /** Current Neko Suite version (for compatibility checks) */
  nekoSuiteVersion: string;
}

// =============================================================================
// Implementation
// =============================================================================

export class InstallManager implements IInstallManager {
  constructor(
    private readonly client: IMarketClient,
    private readonly cache: ICacheManager,
    private readonly license: ILicenseManager,
    private readonly versionResolver: IVersionResolver,
    private readonly targets: InstallTargetRegistry,
    private readonly installed: InstalledRegistry,
    private readonly config: InstallManagerConfig,
  ) {}

  async install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    try {
      // 1. Fetch package info
      const pkg = await this.client.getPackage(packageId);
      if (!pkg) {
        return { success: false, error: `Package not found: ${packageId}` };
      }

      const manifest = pkg.manifest;

      // 2. Check compatibility
      const compatibility = manifest.distribution?.compatibility;
      if (!this.versionResolver.isCompatible(compatibility, this.config.nekoSuiteVersion)) {
        return {
          success: false,
          error: `Incompatible with current Neko Suite version ${this.config.nekoSuiteVersion}`,
        };
      }

      // 3. Check license
      const licenseResult = await this.license.verify(manifest);
      if (!licenseResult.allowed) {
        return { success: false, error: licenseResult.reason ?? 'License verification failed' };
      }

      // 4. Download (or use cache)
      const archivePath = await this.downloadOrCache(packageId, version, manifest, onProgress);

      // 5. Verify integrity
      onProgress?.({ packageId, phase: 'verifying', percent: 0 });
      const integrity = this.getIntegrity(manifest);
      if (integrity) {
        const valid = await verifyIntegrity(archivePath, integrity);
        if (!valid) {
          return { success: false, error: 'Integrity check failed' };
        }
      }
      onProgress?.({ packageId, phase: 'verifying', percent: 100 });

      // 6. Validate via install target
      onProgress?.({ packageId, phase: 'validating', percent: 0 });
      const target = this.targets.get(manifest.type);
      if (!target) {
        return { success: false, error: `No install target for type: ${manifest.type}` };
      }
      onProgress?.({ packageId, phase: 'validating', percent: 100 });

      // 7. Install to target path
      onProgress?.({ packageId, phase: 'installing', percent: 0 });
      const installPath = target.getInstallPath(manifest);
      await mkdir(installPath, { recursive: true });
      await cp(archivePath, installPath, { recursive: true });
      onProgress?.({ packageId, phase: 'installing', percent: 50 });

      // 8. Post-install hook
      if (target.onPostInstall) {
        await target.onPostInstall(manifest, installPath);
      }

      // 9. Record installation
      const record: InstalledPackage = {
        packageId,
        version,
        type: manifest.type,
        installedAt: Date.now(),
        installedPath: installPath,
        manifest,
        enabled: true,
      };
      await this.installed.add(record);

      onProgress?.({ packageId, phase: 'done', percent: 100 });

      return { success: true, installedPath: installPath, manifest };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onProgress?.({ packageId, phase: 'error', percent: 0, error: message });
      return { success: false, error: message };
    }
  }

  async uninstall(packageId: string): Promise<void> {
    const record = this.installed.get(packageId);
    if (!record) return;

    // Pre-uninstall hook
    const target = this.targets.get(record.type);
    if (target?.onPreUninstall) {
      await target.onPreUninstall(record.manifest, record.installedPath);
    }

    // Remove installed files
    await rm(record.installedPath, { recursive: true, force: true });

    // Remove from registry
    await this.installed.remove(packageId);

    // Evict cache
    await this.cache.evict(packageId);
  }

  async update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    // Uninstall old version, then install new
    await this.uninstall(packageId);
    return this.install(packageId, version, onProgress);
  }

  async listInstalled(): Promise<InstalledPackage[]> {
    return this.installed.list();
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    const updates: UpdateInfo[] = [];
    const packages = this.installed.list();

    for (const pkg of packages) {
      try {
        const versions = await this.client.getVersions(pkg.packageId);
        if (versions.length === 0) continue;

        const versionStrings = versions.map((entry) => entry.version);
        const latest = this.versionResolver.maxSatisfying(versionStrings, '*');

        if (latest && this.versionResolver.compare(latest, pkg.version) > 0) {
          const latestInfo = versions.find((entry) => entry.version === latest);
          updates.push({
            packageId: pkg.packageId,
            currentVersion: pkg.version,
            latestVersion: latest,
            changelog: latestInfo?.changelog,
          });
        }
      } catch {
        // Skip packages that fail to check
      }
    }

    return updates;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async downloadOrCache(
    packageId: string,
    version: string,
    manifest: AssetManifest,
    onProgress?: InstallProgressCallback,
  ): Promise<string> {
    // Check cache first
    const cachedPath = await this.cache.getCachedPath(packageId, version);
    if (cachedPath) return cachedPath;

    // Download to temp
    onProgress?.({ packageId, phase: 'downloading', percent: 0 });
    const downloadUrl = await this.client.getDownloadUrl(packageId, version);
    const tempPath = join(tmpdir(), `neko-market-${packageId.replace(/\//g, '__')}-${version}`);

    await downloadFile(downloadUrl, {
      destPath: tempPath,
      resume: true,
      packageId,
      onProgress,
    });

    // Move to cache
    const cachePath = await this.cache.cacheFile(packageId, version, tempPath);
    return cachePath;
  }

  private getIntegrity(manifest: AssetManifest): string | undefined {
    if (manifest.source.kind === 'registry') {
      return manifest.source.integrity;
    }
    return undefined;
  }
}
