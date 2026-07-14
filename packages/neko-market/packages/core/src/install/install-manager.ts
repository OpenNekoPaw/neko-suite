/**
 * InstallManager — Orchestrates the full install lifecycle.
 *
 * Flow: download → verify → install → register
 *
 * Composes: IMarketClient, ICacheManager, ILicenseManager,
 *           IVersionResolver, IntegrityChecker, InstallTargetRegistry,
 *           InstalledRegistry.
 */

import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import type {
  AssetDependency,
  DownloadDescriptor,
  AssetManifest,
  BundleContent,
  IInstallManager,
  IMarketClient,
  ICacheManager,
  ILicenseManager,
  IVersionResolver,
  InstallResult,
  InstallProgressCallback,
  InstalledPackage,
  InstalledLargeAssetState,
  InstallState,
  ProxyVariant,
  ResolvedInstallGraph,
  ResolvedInstallReference,
  SparseItem,
  UpdateInfo,
  WorkspaceTrustLevel,
} from '@neko/shared';
import { getAssetCategory, isPluginTargetTripleCompatible, parseAssetManifest } from '@neko/shared';

import { verifyIntegrity } from './integrity-checker';
import { downloadFile } from './download-service';
import { EffectsActivator, EffectsInverter } from './effects-inverter';
import { PresenceSignatureVerifier, type ManifestSignatureVerifier } from './signature-verifier';
import type { InstallTargetRegistry } from './install-target';
import type { InstalledPackageRegistry } from '../registry/installed-package-registry';

// =============================================================================
// Configuration
// =============================================================================

export interface InstallManagerConfig {
  /** Current Neko Suite version (for compatibility checks) */
  nekoSuiteVersion: string;
  /** Optional quota used by preflight when a host resource service is not wired yet. */
  maxDiskMB?: number;
  maxVramMB?: number;
  unavailablePorts?: readonly number[];
  serverCapabilities?: readonly string[];
  signatureVerifier?: ManifestSignatureVerifier;
  effectsActivator?: EffectsActivator;
  effectsInverter?: EffectsInverter;
  currentTargetTriple?: string;
  workspaceTrustLevel?: WorkspaceTrustLevel;
  getWorkspaceTrustLevel?: () => WorkspaceTrustLevel;
  developerMode?: DeveloperModeState;
  localAssetValidator?: LocalAssetValidator;
  downloadTempDir?: string;
}

export interface DeveloperModeState {
  active: boolean;
  expiresAt?: number;
}

export interface LocalAssetValidationIssue {
  field: string;
  message: string;
}

export interface LocalAssetValidator {
  validateShader?(
    manifest: AssetManifest,
  ): Promise<LocalAssetValidationIssue[]> | LocalAssetValidationIssue[];
  validateModel?(
    manifest: AssetManifest,
  ): Promise<LocalAssetValidationIssue[]> | LocalAssetValidationIssue[];
}

interface InstallExecutionOptions {
  requested: boolean;
  ownerBundleId?: string;
  stack: string[];
}

interface PreflightResult {
  expiresAt?: number;
}

// =============================================================================
// Implementation
// =============================================================================

export class InstallManager implements IInstallManager {
  private readonly signatureVerifier: ManifestSignatureVerifier;
  private readonly effectsActivator: EffectsActivator;
  private readonly effectsInverter: EffectsInverter;
  private readonly activeDownloads = new Map<string, AbortController>();

  constructor(
    private readonly client: IMarketClient,
    private readonly cache: ICacheManager,
    private readonly license: ILicenseManager,
    private readonly versionResolver: IVersionResolver,
    private readonly targets: InstallTargetRegistry,
    private readonly installed: InstalledPackageRegistry,
    private readonly config: InstallManagerConfig,
  ) {
    this.signatureVerifier = config.signatureVerifier ?? new PresenceSignatureVerifier();
    this.effectsActivator = config.effectsActivator ?? new EffectsActivator();
    this.effectsInverter = config.effectsInverter ?? new EffectsInverter();
  }

  async install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    return this.installInternal(packageId, version, onProgress, {
      requested: true,
      stack: [],
    });
  }

  cancelInstall(packageId: string): boolean {
    const controller = this.activeDownloads.get(packageId);
    if (!controller) return false;
    controller.abort();
    this.activeDownloads.delete(packageId);
    return true;
  }

  private async installInternal(
    packageId: string,
    version: string,
    onProgress: InstallProgressCallback | undefined,
    options: InstallExecutionOptions,
  ): Promise<InstallResult> {
    const state: InstallState = {
      packageId,
      version,
      completedPhases: [],
    };

    try {
      // 1. Fetch package info
      this.reportPhase(state, 'discover', 0, onProgress);
      const pkg = await this.client.getPackage(packageId);
      if (!pkg) {
        return { success: false, error: `Package not found: ${packageId}` };
      }
      this.reportPhase(state, 'discover', 100, onProgress);

      const manifest = parseAssetManifest(pkg.manifest);
      if (!this.versionResolver.satisfies(manifest.version, version)) {
        return {
          success: false,
          error: `Package ${packageId}@${manifest.version} does not satisfy requested version ${version}`,
        };
      }
      state.manifest = manifest;
      state.distributionKind = manifest.distributionKind;
      await this.signatureVerifier.verify(manifest);

      // 2. Resolve dependencies and bundle contents before any preflight side effect.
      this.reportPhase(state, 'resolve', 0, onProgress);
      state.resolvedGraph = await this.resolveInstallGraph(manifest, options.stack);
      this.reportPhase(state, 'resolve', 100, onProgress);

      const dependencyInstall = await this.installDependencies(state, onProgress, options);
      if (!dependencyInstall.success) {
        return dependencyInstall;
      }

      // 3. Check compatibility/license/preconditions
      this.reportPhase(state, 'preflight', 0, onProgress);
      const target = this.targets.getForManifest(manifest);
      if (!target) {
        return { success: false, error: `No install target for type: ${manifest.type}` };
      }
      const preflight = await this.runPreflight(manifest, version, target.type);
      if (target.validateManifest) {
        await target.validateManifest(manifest);
      }
      if (target.onPreInstall) {
        await target.onPreInstall(manifest);
      }
      this.reportPhase(state, 'preflight', 100, onProgress);

      let archivePath: string | undefined;
      if (manifest.distributionKind === 'archive') {
        // 4. Download (or use cache)
        const download = await this.downloadOrCache(
          packageId,
          version,
          manifest,
          state,
          onProgress,
        );
        archivePath = download.archivePath;

        // 5. Verify integrity
        this.reportPhase(state, 'verify', 0, onProgress);
        const integrity = this.getIntegrity(manifest);
        if (integrity && download.descriptor.integrity !== integrity) {
          return { success: false, error: 'Download descriptor integrity does not match manifest' };
        }
        if (integrity) {
          const valid = await verifyIntegrity(archivePath, integrity);
          if (!valid) {
            return { success: false, error: 'Integrity check failed' };
          }
        }
        this.reportPhase(state, 'verify', 100, onProgress);
      } else {
        this.reportPhase(state, 'fetch', 100, onProgress);
        this.reportPhase(state, 'verify', 100, onProgress);
      }

      // 7. Stage to target path
      this.reportPhase(state, 'stage', 0, onProgress);
      const installPath = target.getInstallPath(manifest);
      state.installedPath = installPath;
      if (manifest.distributionKind === 'registration' && !target.writeRegistration) {
        throw new Error(
          `Install target for ${manifest.type} must implement writeRegistration for registration distribution`,
        );
      }
      await mkdir(installPath, { recursive: true });
      if (manifest.distributionKind === 'archive') {
        if (!archivePath) {
          return { success: false, error: 'Archive path missing after fetch' };
        }
        if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
          await execFileAsync('tar', ['-xzf', archivePath, '-C', installPath]);
        } else if (archivePath.endsWith('.zip')) {
          await execFileAsync('unzip', ['-o', archivePath, '-d', installPath]);
        } else {
          // Fallback: assume the archive is already a directory (e.g., from cache)
          const { cp } = await import('node:fs/promises');
          await cp(archivePath, installPath, { recursive: true });
        }
      } else if (manifest.distributionKind === 'registration') {
        await target.writeRegistration?.(manifest, installPath);
      }
      this.reportPhase(state, 'stage', 100, onProgress);

      if (manifest.distributionKind === 'orchestration') {
        const orchestration = await this.installBundleContents(
          manifest,
          state,
          onProgress,
          options,
        );
        if (!orchestration.success) {
          return orchestration;
        }
      }

      // 8. Post-install hook
      this.reportPhase(state, 'activate', 0, onProgress);
      await this.effectsActivator.activate(manifest);
      if (target.onPostInstall) {
        await target.onPostInstall(manifest, installPath);
      }
      this.reportPhase(state, 'activate', 100, onProgress);

      // 9. Record installation
      this.reportPhase(state, 'record', 0, onProgress);
      const record: InstalledPackage = {
        packageId,
        version,
        type: manifest.type,
        installedAt: Date.now(),
        installedPath: installPath,
        manifest,
        enabled: true,
        requested: options.requested,
        status: manifest.deprecation ? 'deprecated' : 'active',
        expiresAt: preflight.expiresAt,
        largeAsset: this.createLargeAssetState(manifest),
      };
      await this.installed.add(record);
      if (!options.requested && options.ownerBundleId) {
        await this.installed.addReference(packageId, options.ownerBundleId);
      }
      this.reportPhase(state, 'record', 100, onProgress);

      onProgress?.({ packageId, phase: 'done', percent: 100 });

      return { success: true, installedPath: installPath, manifest };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.rollback(state);
      onProgress?.({ packageId, phase: 'error', percent: 0, error: message });
      return { success: false, error: message };
    }
  }

  async uninstall(packageId: string): Promise<void> {
    const record = this.installed.get(packageId);
    if (!record) return;

    if (record.requested) {
      const ref = this.installed.getReference(packageId);
      if (ref && ref.refCount > 0) {
        await this.installed.setRequested(packageId, false);
        return;
      }
    }

    const ownerReferenceRemovals =
      record.manifest.type === 'bundle' ? await this.removeBundleReferences(record.manifest) : [];

    // Pre-uninstall hook
    const target = this.targets.getForManifest(record.manifest);
    if (target?.onPreUninstall) {
      await target.onPreUninstall(record.manifest, record.installedPath);
    }
    await this.invertEffects(record.manifest, record.installedPath);

    // Remove installed files
    await rm(record.installedPath, { recursive: true, force: true });

    // Remove from registry
    await this.installed.remove(packageId);

    // Evict cache
    await this.cache.evict(packageId);

    for (const removal of ownerReferenceRemovals) {
      if (removal.next) continue;
      await this.uninstallBundleContentIfUnowned(removal.packageId);
    }
  }

  private async resolveInstallGraph(
    manifest: AssetManifest,
    stack: readonly string[],
  ): Promise<ResolvedInstallGraph> {
    const path = [...stack, manifest.id];
    const dependencies = await this.resolveReferences(
      manifest.dependencies ?? [],
      'dependency',
      path,
    );
    const bundleContents = await this.resolveReferences(
      manifest.contents ?? [],
      'bundle-content',
      path,
    );
    return { dependencies, bundleContents };
  }

  private async resolveReferences(
    refs: readonly (AssetDependency | BundleContent)[],
    relation: ResolvedInstallReference['relation'],
    stack: readonly string[],
  ): Promise<ResolvedInstallReference[]> {
    const resolved: ResolvedInstallReference[] = [];
    const seen = new Set<string>();

    for (const ref of refs) {
      const packageId = this.getReferencePackageId(ref);
      if (seen.has(packageId)) {
        throw new Error(`Duplicate ${relation} reference: ${packageId}`);
      }
      seen.add(packageId);

      const optional = ref.optional ?? false;
      if (stack.includes(packageId)) {
        throw new Error(`Dependency cycle detected: ${[...stack, packageId].join(' -> ')}`);
      }

      const installed = this.installed.get(packageId);
      if (installed && this.versionResolver.satisfies(installed.version, ref.version)) {
        if (relation === 'bundle-content' && this.isLocalManifest(installed.manifest)) {
          throw new Error(`Bundle content cannot reference sideload asset: ${packageId}`);
        }
        await this.assertResolvedChildIsAcyclic(installed.manifest, stack);
        resolved.push({
          packageId,
          requestedRange: ref.version,
          resolvedVersion: installed.version,
          relation,
          optional,
          reusedInstalled: true,
          manifest: installed.manifest,
        });
        continue;
      }

      const versions = await this.client.getVersions(packageId).catch((error: unknown) => {
        if (optional) return [];
        throw error;
      });
      const versionStrings = versions.map((entry) => entry.version);
      const resolvedVersion = this.versionResolver.maxSatisfying(versionStrings, ref.version);
      if (!resolvedVersion) {
        if (optional) {
          resolved.push({
            packageId,
            requestedRange: ref.version,
            relation,
            optional,
            reusedInstalled: false,
            skipped: true,
            skipReason: 'no-satisfying-version',
          });
          continue;
        }
        throw new Error(`No version of ${packageId} satisfies ${ref.version}`);
      }

      const pkg = await this.client.getPackage(packageId);
      if (!pkg) {
        if (optional) {
          resolved.push({
            packageId,
            requestedRange: ref.version,
            resolvedVersion,
            relation,
            optional,
            reusedInstalled: false,
            skipped: true,
            skipReason: 'package-not-found',
          });
          continue;
        }
        throw new Error(`Package not found while resolving ${packageId}`);
      }

      const childManifest = parseAssetManifest(pkg.manifest);
      if (relation === 'bundle-content' && this.isLocalManifest(childManifest)) {
        throw new Error(`Bundle content cannot reference sideload asset: ${packageId}`);
      }
      if (!this.versionResolver.satisfies(childManifest.version, ref.version)) {
        if (optional) {
          resolved.push({
            packageId,
            requestedRange: ref.version,
            relation,
            optional,
            reusedInstalled: false,
            skipped: true,
            skipReason: 'manifest-version-mismatch',
          });
          continue;
        }
        throw new Error(
          `Resolved manifest ${packageId}@${childManifest.version} does not satisfy ${ref.version}`,
        );
      }
      await this.signatureVerifier.verify(childManifest);
      await this.resolveInstallGraph(childManifest, stack);

      resolved.push({
        packageId,
        requestedRange: ref.version,
        resolvedVersion,
        relation,
        optional,
        reusedInstalled: false,
        manifest: childManifest,
      });
    }

    return resolved;
  }

  private getReferencePackageId(ref: AssetDependency | BundleContent): string {
    return 'packageId' in ref ? ref.packageId : ref.id;
  }

  private async assertResolvedChildIsAcyclic(
    childManifest: AssetManifest,
    stack: readonly string[],
  ): Promise<void> {
    const childStack = [...stack, childManifest.id];
    const refs = [
      ...(childManifest.dependencies?.map((dependency) => dependency.id) ?? []),
      ...(childManifest.contents?.map((content) => content.packageId) ?? []),
    ];
    for (const ref of refs) {
      if (childStack.includes(ref)) {
        throw new Error(`Dependency cycle detected: ${[...childStack, ref].join(' -> ')}`);
      }
      const installed = this.installed.get(ref);
      if (installed) {
        await this.assertResolvedChildIsAcyclic(installed.manifest, childStack);
      }
    }
  }

  private async installBundleContents(
    manifest: AssetManifest,
    state: InstallState,
    onProgress: InstallProgressCallback | undefined,
    options: InstallExecutionOptions,
  ): Promise<InstallResult> {
    const bundleContents = state.resolvedGraph?.bundleContents ?? [];
    for (const content of bundleContents) {
      if (content.skipped) continue;

      const installed = this.installed.get(content.packageId);
      if (installed && content.reusedInstalled) {
        await this.installed.addReference(content.packageId, manifest.id);
        continue;
      }

      const resolvedVersion = content.resolvedVersion ?? content.manifest?.version;
      if (!resolvedVersion) {
        if (content.optional) continue;
        return { success: false, error: `Unable to resolve bundle content ${content.packageId}` };
      }

      const result = await this.installInternal(content.packageId, resolvedVersion, onProgress, {
        requested: false,
        ownerBundleId: manifest.id,
        stack: [...options.stack, manifest.id],
      });
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  }

  private async installDependencies(
    state: InstallState,
    onProgress: InstallProgressCallback | undefined,
    options: InstallExecutionOptions,
  ): Promise<InstallResult> {
    const dependencies = state.resolvedGraph?.dependencies ?? [];
    for (const dependency of dependencies) {
      if (dependency.skipped || dependency.reusedInstalled) continue;
      const resolvedVersion = dependency.resolvedVersion ?? dependency.manifest?.version;
      if (!resolvedVersion) {
        if (dependency.optional) continue;
        return { success: false, error: `Unable to resolve dependency ${dependency.packageId}` };
      }
      const result = await this.installInternal(dependency.packageId, resolvedVersion, onProgress, {
        requested: false,
        stack: [...options.stack, state.packageId],
      });
      if (!result.success) return result;
    }
    return { success: true };
  }

  private async removeBundleReferences(manifest: AssetManifest) {
    const contentIds = manifest.contents?.map((content) => content.packageId);
    return this.installed.removeOwnerReferences(manifest.id, contentIds);
  }

  private async uninstallBundleContentIfUnowned(packageId: string): Promise<void> {
    const contentRecord = this.installed.get(packageId);
    if (!contentRecord || contentRecord.requested) return;
    const ref = this.installed.getReference(packageId);
    if (ref && ref.refCount > 0) return;
    await this.uninstall(packageId);
  }

  async update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    // Uninstall old version, then install new
    await this.uninstall(packageId);
    const result = await this.install(packageId, version, onProgress);
    if (result.success) {
      await this.installed.update(packageId, (current) => ({
        ...current,
        status: current.manifest.deprecation ? 'deprecated' : 'active',
      }));
    }
    return result;
  }

  async enable(packageId: string): Promise<void> {
    await this.installed.setEnabled(packageId, true);
  }

  async disable(packageId: string): Promise<void> {
    await this.installed.setEnabled(packageId, false);
  }

  async listInstalled(): Promise<InstalledPackage[]> {
    await this.installed.ready();
    return this.installed.list();
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    const updates: UpdateInfo[] = [];
    const packages = this.installed.list();

    for (const pkg of packages) {
      if (this.isLocalManifest(pkg.manifest)) continue;
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

  async ensureFull(packageId: string, itemId?: string): Promise<InstallResult> {
    const record = this.installed.get(packageId);
    if (!record) {
      return { success: false, error: `Package is not installed: ${packageId}` };
    }

    const largeAsset = record.manifest.largeAsset;
    if (!largeAsset) {
      return { success: true, installedPath: record.installedPath, manifest: record.manifest };
    }

    if (
      record.largeAsset?.state === 'full' &&
      (!itemId || record.largeAsset.downloadedItems?.includes(itemId))
    ) {
      return { success: true, installedPath: record.installedPath, manifest: record.manifest };
    }

    if (itemId) {
      const variant = largeAsset.variants?.find((entry) => entry.variantId === itemId);
      if (variant) {
        return this.ensureVariant(record, variant.variantId);
      }

      const sparseItem = largeAsset.sparseItems?.find((item) => item.itemId === itemId);
      if (!sparseItem) {
        return { success: false, error: `Sparse item not found: ${itemId}` };
      }
      const existingItems = record.largeAsset?.downloadedItems ?? [];
      const downloadedItems = existingItems.includes(itemId)
        ? existingItems
        : [...existingItems, itemId];
      await this.installed.update(packageId, (current) => ({
        ...current,
        largeAsset: {
          ...(current.largeAsset ?? { state: 'partial' }),
          state:
            downloadedItems.length === (largeAsset.sparseItems?.length ?? downloadedItems.length)
              ? 'full'
              : 'partial',
          selectedItems: current.largeAsset?.selectedItems ?? downloadedItems,
          downloadedItems,
          totalSize: largeAsset.totalSize,
          downloadedSize: this.sumSparseItems(largeAsset.sparseItems, downloadedItems),
        },
      }));
      return { success: true, installedPath: record.installedPath, manifest: record.manifest };
    }

    if (largeAsset.modes.includes('variant')) {
      const variant =
        largeAsset.variants?.find((entry) => entry.recommended) ?? largeAsset.variants?.[0];
      if (!variant)
        return { success: false, error: 'No variant is available for full quality download' };
      return this.ensureVariant(record, variant.variantId);
    }

    if (largeAsset.modes.includes('proxy')) {
      return this.ensureProxyFull(record);
    }

    if (largeAsset.modes.includes('delta')) {
      return this.ensureDeltaFull(record);
    }

    if (largeAsset.modes.includes('sparse')) {
      const itemIds = largeAsset.sparseItems?.map((item) => item.itemId) ?? [];
      for (const sparseItemId of itemIds) {
        const result = await this.ensureFull(packageId, sparseItemId);
        if (!result.success) return result;
      }
      const latest = this.installed.get(packageId) ?? record;
      return { success: true, installedPath: latest.installedPath, manifest: latest.manifest };
    }

    return { success: true, installedPath: record.installedPath, manifest: record.manifest };
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async runPreflight(
    manifest: AssetManifest,
    version: string,
    targetType: AssetManifest['type'],
  ): Promise<PreflightResult> {
    if (targetType !== manifest.type) {
      throw new Error(
        `Install target type ${targetType} cannot handle manifest type ${manifest.type}`,
      );
    }

    const compatibility = manifest.distribution?.compatibility;
    if (!this.versionResolver.isCompatible(compatibility, this.config.nekoSuiteVersion)) {
      throw new Error(
        `Incompatible with current Neko Suite version ${this.config.nekoSuiteVersion}`,
      );
    }

    const entitlement = await this.checkEntitlement(manifest, version);
    if (!entitlement.allowed) {
      throw new Error(entitlement.reason ?? 'Entitlement check failed');
    }
    if (entitlement.expiresAt !== undefined && entitlement.expiresAt < Date.now()) {
      throw new Error('Package entitlement has expired');
    }

    this.checkInstalledStatus(manifest);
    this.checkTrust(manifest);
    this.checkWorkspaceTrust(manifest);
    this.checkPluginGovernance(manifest);
    this.checkConflicts(manifest);
    this.checkResourceEstimates(manifest);
    this.checkCapabilities(manifest);
    await this.checkLocalAssetValidation(manifest);

    return { expiresAt: entitlement.expiresAt };
  }

  private async checkEntitlement(
    manifest: AssetManifest,
    version: string,
  ): Promise<{ allowed: boolean; reason?: string; expiresAt?: number }> {
    const serverResult = await Promise.resolve(
      this.client.checkEntitlement(manifest.id, version),
    ).catch(() => undefined);
    if (serverResult) return serverResult;

    const licenseResult = await this.license.verify(manifest);
    return {
      allowed: licenseResult.allowed,
      reason: licenseResult.reason,
      expiresAt: licenseResult.expiresAt,
    };
  }

  private checkInstalledStatus(manifest: AssetManifest): void {
    const installed = this.installed.get(manifest.id);
    if (!installed) return;
    if (installed.status === 'expired') {
      throw new Error(`Installed package is expired: ${manifest.id}`);
    }
    if (installed.status === 'incompatible') {
      throw new Error(`Installed package is incompatible: ${manifest.id}`);
    }
    if (!this.versionResolver.satisfies(installed.version, manifest.version)) {
      return;
    }
    if (installed.enabled) {
      throw new Error(`Package is already installed: ${manifest.id}@${installed.version}`);
    }
  }

  private checkTrust(manifest: AssetManifest): void {
    const trustLevel = manifest.distribution?.trustLevel;
    if (trustLevel !== 'untrusted') return;
    const category = getAssetCategory(manifest.type);
    if (category !== 'media') {
      throw new Error(`Untrusted package cannot install ${manifest.type} assets`);
    }
  }

  private checkWorkspaceTrust(manifest: AssetManifest): void {
    const trust = this.getWorkspaceTrustLevel();
    if (!this.isLocalManifest(manifest)) {
      if (manifest.type === 'plugin' && trust === 'limited' && !this.isCorePublisher(manifest)) {
        throw new Error(
          `Limited workspace cannot load verified third-party plugin: ${manifest.id}`,
        );
      }
      return;
    }

    if (trust !== 'trusted') {
      throw new Error(`Sideload asset requires trusted workspace: ${manifest.id}`);
    }
  }

  private checkPluginGovernance(manifest: AssetManifest): void {
    if (manifest.type !== 'plugin') return;

    const metadata =
      manifest.typeMetadata?.type === 'plugin' ? manifest.typeMetadata.data : undefined;
    if (!metadata) {
      throw new Error(`Plugin manifest is missing native plugin metadata: ${manifest.id}`);
    }

    if (this.isLocalManifest(manifest)) {
      this.checkDeveloperModeForLocalPlugin(manifest);
    } else if (!this.isVerifiedPluginPublisher(manifest)) {
      throw new Error(`Native plugin requires core or verified publisher: ${manifest.id}`);
    }

    if (
      this.config.currentTargetTriple &&
      !isPluginTargetTripleCompatible(
        metadata.engineRequirements.targetTriple,
        this.config.currentTargetTriple,
      )
    ) {
      throw new Error(
        `Plugin target triple ${metadata.engineRequirements.targetTriple} is incompatible with ${this.config.currentTargetTriple}`,
      );
    }
  }

  private checkDeveloperModeForLocalPlugin(manifest: AssetManifest): void {
    const developerMode = this.config.developerMode;
    if (!developerMode?.active) {
      throw new Error(`Local native plugin requires Developer Mode: ${manifest.id}`);
    }
    if (developerMode.expiresAt !== undefined && developerMode.expiresAt <= Date.now()) {
      throw new Error(`Developer Mode has expired for local native plugin: ${manifest.id}`);
    }
  }

  private async checkLocalAssetValidation(manifest: AssetManifest): Promise<void> {
    if (!this.isLocalManifest(manifest)) return;
    const validator = this.config.localAssetValidator;
    const issues =
      manifest.type === 'shader'
        ? await validator?.validateShader?.(manifest)
        : manifest.type === 'model'
          ? await validator?.validateModel?.(manifest)
          : undefined;
    if (!issues || issues.length === 0) return;
    throw new Error(
      `Local ${manifest.type} validation failed: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')}`,
    );
  }

  private getWorkspaceTrustLevel(): WorkspaceTrustLevel {
    return this.config.getWorkspaceTrustLevel?.() ?? this.config.workspaceTrustLevel ?? 'trusted';
  }

  private isVerifiedPluginPublisher(manifest: AssetManifest): boolean {
    return this.isCorePublisher(manifest) || manifest.distribution?.publisher?.verified === true;
  }

  private isCorePublisher(manifest: AssetManifest): boolean {
    return manifest.distribution?.trustLevel === 'core';
  }

  private isLocalManifest(manifest: AssetManifest): boolean {
    return (
      manifest.source.kind === 'local-link' ||
      (manifest.source.kind === 'local' && manifest.source.storageMode === 'copy-managed')
    );
  }

  private checkConflicts(manifest: AssetManifest): void {
    const conflicts = manifest.effects?.conflicts ?? [];
    const installedConflicts = conflicts.filter((packageId) => this.installed.has(packageId));
    if (installedConflicts.length > 0) {
      throw new Error(
        `Package conflicts with installed package(s): ${installedConflicts.join(', ')}`,
      );
    }
  }

  private checkResourceEstimates(manifest: AssetManifest): void {
    const resources = manifest.effects?.resources;
    if (!resources) return;
    if (this.config.maxDiskMB !== undefined && (resources.diskMB ?? 0) > this.config.maxDiskMB) {
      throw new Error(
        `Package requires ${resources.diskMB}MB disk, exceeds quota ${this.config.maxDiskMB}MB`,
      );
    }
    if (this.config.maxVramMB !== undefined && (resources.vramMB ?? 0) > this.config.maxVramMB) {
      throw new Error(
        `Package requires ${resources.vramMB}MB VRAM, exceeds quota ${this.config.maxVramMB}MB`,
      );
    }
    const unavailablePorts = new Set(this.config.unavailablePorts ?? []);
    const blockedPort = resources.ports?.find((port) => unavailablePorts.has(port));
    if (blockedPort !== undefined) {
      throw new Error(`Package requires unavailable port ${blockedPort}`);
    }
  }

  private checkCapabilities(manifest: AssetManifest): void {
    const capabilities = new Set(this.config.serverCapabilities ?? []);
    const modes = manifest.largeAsset?.modes ?? [];
    const optionalModes = modes.filter(
      (mode) => mode === 'sparse' || mode === 'proxy' || mode === 'delta',
    );
    for (const mode of optionalModes) {
      if (this.config.serverCapabilities !== undefined && !capabilities.has(mode)) {
        throw new Error(`Registry capability is not available: ${mode}`);
      }
    }
  }

  private createLargeAssetState(manifest: AssetManifest): InstalledLargeAssetState | undefined {
    const largeAsset = manifest.largeAsset;
    if (!largeAsset) return undefined;

    const recommendedVariant =
      largeAsset.variants?.find((variant) => variant.recommended) ?? largeAsset.variants?.[0];
    if (largeAsset.modes.includes('variant') && recommendedVariant) {
      return {
        state: 'full',
        selectedVariantId: recommendedVariant.variantId,
        totalSize: recommendedVariant.size,
        downloadedSize: recommendedVariant.size,
      };
    }

    const defaultProxy =
      largeAsset.proxyVariants?.find((variant) => variant.default) ?? largeAsset.proxyVariants?.[0];
    if (largeAsset.modes.includes('proxy') && defaultProxy) {
      return {
        state: 'proxy',
        proxyQuality: defaultProxy.qualityTag,
        totalSize: largeAsset.totalSize,
        downloadedSize: defaultProxy.size,
      };
    }

    if (largeAsset.modes.includes('sparse')) {
      const selectedItems =
        largeAsset.sparseItems?.filter((item) => item.defaultSelected).map((item) => item.itemId) ??
        [];
      return {
        state: selectedItems.length > 0 ? 'partial' : 'manifest-only',
        selectedItems,
        downloadedItems: selectedItems,
        totalSize: largeAsset.totalSize,
        downloadedSize: this.sumSparseItems(largeAsset.sparseItems, selectedItems),
      };
    }

    if (largeAsset.modes.includes('delta')) {
      return {
        state: 'owned',
        totalSize: largeAsset.totalSize,
        downloadedSize: 0,
      };
    }

    return {
      state: 'full',
      totalSize: largeAsset.totalSize,
      downloadedSize: largeAsset.totalSize,
    };
  }

  private sumSparseItems(
    sparseItems: readonly SparseItem[] | undefined,
    itemIds: readonly string[],
  ): number {
    if (!Array.isArray(sparseItems)) return 0;
    const selected = new Set(itemIds);
    return sparseItems.reduce(
      (total, item) => (selected.has(item.itemId) ? total + item.size : total),
      0,
    );
  }

  private async ensureVariant(record: InstalledPackage, variantId: string): Promise<InstallResult> {
    const variant = record.manifest.largeAsset?.variants?.find(
      (entry) => entry.variantId === variantId,
    );
    if (!variant) {
      return { success: false, error: `Variant not found: ${variantId}` };
    }

    try {
      const descriptor = await this.client.getVariantDownloadDescriptor(
        record.packageId,
        variantId,
      );
      const payloadPath = this.largeAssetPayloadPath(record, `variant-${variantId}`);
      await this.downloadAndVerifyLargeAsset(record.packageId, descriptor, payloadPath);
      await this.installed.update(record.packageId, (current) => ({
        ...current,
        largeAsset: {
          ...(current.largeAsset ?? { state: 'owned' }),
          state: 'full',
          selectedVariantId: variantId,
          totalSize: variant.size,
          downloadedSize: descriptor.size,
        },
      }));
      return { success: true, installedPath: record.installedPath, manifest: record.manifest };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private async ensureProxyFull(record: InstalledPackage): Promise<InstallResult> {
    const largeAsset = record.manifest.largeAsset;
    const quality = this.getFullProxyQuality(largeAsset?.proxyVariants);
    if (!quality) {
      return { success: false, error: 'No proxy variant is available for full quality upgrade' };
    }

    const payloadPath = this.largeAssetPayloadPath(record, `proxy-${quality.qualityTag}`);
    try {
      const descriptor = await this.client.getProxyVariantDownloadDescriptor(
        record.packageId,
        quality.qualityTag,
      );
      await this.downloadAndVerifyLargeAsset(record.packageId, descriptor, payloadPath);
      await this.installed.update(record.packageId, (current) => ({
        ...current,
        largeAsset: {
          ...(current.largeAsset ?? { state: 'proxy' }),
          state: 'full',
          proxyQuality: quality.qualityTag,
          totalSize: largeAsset?.totalSize,
          downloadedSize: descriptor.size,
        },
      }));
      return { success: true, installedPath: record.installedPath, manifest: record.manifest };
    } catch (error) {
      await rm(payloadPath, { recursive: true, force: true }).catch(() => undefined);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private async ensureDeltaFull(record: InstalledPackage): Promise<InstallResult> {
    const deltaBase = record.manifest.largeAsset?.deltaBase;
    if (!deltaBase) {
      return { success: false, error: 'Delta base is missing from manifest' };
    }

    const payloadPath = this.largeAssetPayloadPath(
      record,
      `delta-${deltaBase.version}-to-${record.version}`,
    );
    try {
      const descriptor = await this.client.getDeltaDownloadDescriptor(
        record.packageId,
        deltaBase.version,
        record.version,
      );
      const fullDescriptor = await this.resolveDeltaFullDescriptor(record, descriptor);
      await this.downloadAndVerifyLargeAsset(record.packageId, fullDescriptor, payloadPath);
      await this.installed.update(record.packageId, (current) => ({
        ...current,
        largeAsset: {
          ...(current.largeAsset ?? { state: 'owned' }),
          state: 'full',
          totalSize: record.manifest.largeAsset?.totalSize,
          downloadedSize: fullDescriptor.size,
        },
      }));
      return { success: true, installedPath: record.installedPath, manifest: record.manifest };
    } catch (error) {
      await rm(payloadPath, { recursive: true, force: true }).catch(() => undefined);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private getFullProxyQuality(
    variants: readonly ProxyVariant[] | undefined,
  ): ProxyVariant | undefined {
    return (
      variants?.find((variant) => variant.qualityTag === 'original') ??
      variants?.find((variant) => !variant.default) ??
      variants?.[0]
    );
  }

  private async downloadAndVerifyLargeAsset(
    packageId: string,
    descriptor: DownloadDescriptor,
    payloadPath: string,
  ): Promise<void> {
    await mkdir(dirname(payloadPath), { recursive: true });
    const controller = this.createDownloadController(packageId);
    try {
      await downloadFile(descriptor.url, {
        destPath: payloadPath,
        resume: descriptor.resumable,
        packageId,
        signal: controller.signal,
      });
      const valid = await verifyIntegrity(payloadPath, descriptor.integrity);
      if (!valid) {
        throw new Error('Large asset integrity check failed');
      }
    } finally {
      this.releaseDownloadController(packageId, controller);
    }
  }

  private async resolveDeltaFullDescriptor(
    record: InstalledPackage,
    descriptor: Awaited<ReturnType<IMarketClient['getDeltaDownloadDescriptor']>>,
  ): Promise<DownloadDescriptor> {
    const fullDescriptor = await this.client.getDownloadDescriptor(
      record.packageId,
      record.version,
    );
    // TODO(P1): Apply descriptor.patchFormat (xdelta3/bsdiff/rsync) when the local
    // deltaBase is available. P0 intentionally downloads the full fallback bytes
    // and verifies SRI so rollback can preserve the current installed baseline.
    return descriptor.fallbackUrl
      ? { ...fullDescriptor, url: descriptor.fallbackUrl }
      : fullDescriptor;
  }

  private largeAssetPayloadPath(record: InstalledPackage, label: string): string {
    return join(record.installedPath, '.large-assets', sanitizePathSegment(label));
  }

  private async downloadOrCache(
    packageId: string,
    version: string,
    manifest: AssetManifest,
    state: InstallState,
    onProgress?: InstallProgressCallback,
  ): Promise<{ archivePath: string; descriptor: DownloadDescriptor }> {
    // Check cache first
    const cachedPath = await this.cache.getCachedPath(packageId, version);
    if (cachedPath) {
      const descriptor = await this.client.getDownloadDescriptor(packageId, version);
      state.downloaded = descriptor;
      this.reportPhase(state, 'fetch', 100, onProgress);
      return { archivePath: cachedPath, descriptor };
    }

    // Download to temp
    onProgress?.({ packageId, phase: 'fetch', percent: 0 });
    const descriptor = await this.client.getDownloadDescriptor(packageId, version);
    state.downloaded = descriptor;
    const tempDir = this.config.downloadTempDir;
    if (!tempDir) {
      throw new Error('InstallManager requires downloadTempDir for uncached downloads.');
    }
    await mkdir(tempDir, { recursive: true });
    const tempPath = join(tempDir, `neko-market-${packageId.replace(/\//g, '__')}-${version}`);

    const controller = this.createDownloadController(packageId);
    try {
      await downloadFile(descriptor.url, {
        destPath: tempPath,
        resume: true,
        packageId,
        onProgress,
        signal: controller.signal,
      });
    } finally {
      this.releaseDownloadController(packageId, controller);
    }
    this.reportPhase(state, 'fetch', 100, onProgress);

    // Move to cache
    const cachePath = await this.cache.cacheFile(packageId, version, tempPath);
    return { archivePath: cachePath, descriptor };
  }

  private getIntegrity(manifest: AssetManifest): string | undefined {
    if (manifest.source.kind === 'registry') {
      return manifest.source.integrity;
    }
    return undefined;
  }

  private reportPhase(
    state: InstallState,
    phase: InstallState['completedPhases'][number],
    percent: number,
    onProgress?: InstallProgressCallback,
  ): void {
    if (percent === 100 && !state.completedPhases.includes(phase)) {
      state.completedPhases.push(phase);
    }
    onProgress?.({ packageId: state.packageId, phase, percent });
  }

  private async rollback(state: InstallState): Promise<void> {
    if (!state.manifest) return;
    const target = this.targets.getForManifest(state.manifest);
    if (target?.onRollback) {
      await Promise.resolve(target.onRollback(state.manifest, state)).catch(() => undefined);
    }
    await Promise.resolve(this.invertEffects(state.manifest, state.installedPath)).catch(
      () => undefined,
    );
    if (state.installedPath) {
      await rm(state.installedPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async invertEffects(manifest: AssetManifest, installedPath?: string): Promise<void> {
    await this.effectsInverter.invert(manifest, { installedPath });
  }

  private createDownloadController(packageId: string): AbortController {
    const previous = this.activeDownloads.get(packageId);
    if (previous) previous.abort();
    const controller = new AbortController();
    this.activeDownloads.set(packageId, controller);
    return controller;
  }

  private releaseDownloadController(packageId: string, controller: AbortController): void {
    if (this.activeDownloads.get(packageId) === controller) {
      this.activeDownloads.delete(packageId);
    }
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
