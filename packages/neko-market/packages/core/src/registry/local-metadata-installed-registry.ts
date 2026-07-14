import type { InstalledPackage, InstalledPackageRefState, WorkspaceTrustLevel } from '@neko/shared';
import type {
  MarketInstallationRecord,
  MarketInstallationRepository,
  MarketInstallationTrustSource,
} from '@neko/shared/local-metadata';
import type { PathResolver } from '@neko/shared/path';
import type { InstalledPackageRegistry, RemovedReferenceState } from './installed-package-registry';

export interface LocalMetadataInstalledRegistryOptions {
  readonly now?: () => number;
  readonly trustSource: MarketInstallationTrustSource;
  readonly getTrustLevel?: () => WorkspaceTrustLevel;
}

export class LocalMetadataInstalledRegistry implements InstalledPackageRegistry {
  private readonly packages = new Map<string, InstalledPackage>();
  private readonly referenceOwners = new Map<string, readonly string[]>();
  private readonly trustDecisions = new Map<string, MarketInstallationRecord['trustDecision']>();
  private readonly now: () => number;
  private loaded = false;
  private loadPromise: Promise<void> | undefined;

  constructor(
    private readonly repository: MarketInstallationRepository,
    private readonly pathResolver: PathResolver,
    private readonly options: LocalMetadataInstalledRegistryOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  load(): Promise<void> {
    this.loadPromise ??= this.loadFromRepository();
    return this.loadPromise;
  }

  async ready(): Promise<void> {
    await this.load();
  }

  async add(pkg: InstalledPackage): Promise<void> {
    this.ensureLoaded();
    const owners = this.referenceOwners.get(pkg.packageId) ?? [];
    const trustDecision =
      this.trustDecisions.get(pkg.packageId) ?? this.createCurrentTrustDecision();
    await this.persist(pkg, owners, trustDecision);
  }

  async setRequested(packageId: string, requested: boolean): Promise<void> {
    await this.update(packageId, (pkg) => ({ ...pkg, requested }));
  }

  async update(
    packageId: string,
    updater: (pkg: InstalledPackage) => InstalledPackage,
  ): Promise<InstalledPackage | undefined> {
    this.ensureLoaded();
    const current = this.packages.get(packageId);
    if (!current) return undefined;
    const next = updater(current);
    if (next.packageId !== packageId) {
      throw new Error(`Installed package update cannot change packageId: ${packageId}`);
    }
    await this.persist(
      next,
      this.referenceOwners.get(packageId) ?? [],
      this.trustDecisions.get(packageId) ?? null,
    );
    return next;
  }

  async setEnabled(packageId: string, enabled: boolean): Promise<void> {
    await this.update(packageId, (pkg) => ({ ...pkg, enabled }));
  }

  async remove(packageId: string): Promise<void> {
    this.ensureLoaded();
    if (!this.packages.has(packageId)) return;
    const affected = [...this.referenceOwners.entries()].filter(([, owners]) =>
      owners.includes(packageId),
    );
    for (const [referencedPackageId, owners] of affected) {
      const referenced = this.requirePackage(referencedPackageId);
      await this.persist(
        referenced,
        owners.filter((owner) => owner !== packageId),
        this.trustDecisions.get(referencedPackageId) ?? null,
      );
    }
    await this.repository.delete(packageId);
    this.packages.delete(packageId);
    this.referenceOwners.delete(packageId);
    this.trustDecisions.delete(packageId);
  }

  async addReference(packageId: string, ownerPackageId: string): Promise<InstalledPackageRefState> {
    this.ensureLoaded();
    const pkg = this.requirePackage(packageId);
    const current = this.referenceOwners.get(packageId) ?? [];
    const owners = current.includes(ownerPackageId) ? current : [...current, ownerPackageId];
    if (owners !== current) {
      await this.persist(pkg, owners, this.trustDecisions.get(packageId) ?? null);
    }
    return { refCount: owners.length, owners: [...owners] };
  }

  async removeReference(
    packageId: string,
    ownerPackageId: string,
  ): Promise<InstalledPackageRefState | undefined> {
    this.ensureLoaded();
    const current = this.referenceOwners.get(packageId);
    if (!current || !current.includes(ownerPackageId)) {
      return current ? { refCount: current.length, owners: [...current] } : undefined;
    }
    const pkg = this.requirePackage(packageId);
    const owners = current.filter((owner) => owner !== ownerPackageId);
    await this.persist(pkg, owners, this.trustDecisions.get(packageId) ?? null);
    return owners.length > 0 ? { refCount: owners.length, owners: [...owners] } : undefined;
  }

  async removeOwnerReferences(
    ownerPackageId: string,
    packageIds?: readonly string[],
  ): Promise<RemovedReferenceState[]> {
    this.ensureLoaded();
    const ids = packageIds ?? [...this.referenceOwners.keys()];
    const removed: RemovedReferenceState[] = [];
    for (const packageId of ids) {
      const current = this.referenceOwners.get(packageId);
      if (!current?.includes(ownerPackageId)) continue;
      const owners = current.filter((owner) => owner !== ownerPackageId);
      await this.persist(
        this.requirePackage(packageId),
        owners,
        this.trustDecisions.get(packageId) ?? null,
      );
      removed.push({
        packageId,
        previous: { refCount: current.length, owners: [...current] },
        ...(owners.length > 0 ? { next: { refCount: owners.length, owners: [...owners] } } : {}),
      });
    }
    return removed;
  }

  getReference(packageId: string): InstalledPackageRefState | undefined {
    this.ensureLoaded();
    const owners = this.referenceOwners.get(packageId);
    return owners?.length ? { refCount: owners.length, owners: [...owners] } : undefined;
  }

  get(packageId: string): InstalledPackage | undefined {
    this.ensureLoaded();
    return this.packages.get(packageId);
  }

  list(): InstalledPackage[] {
    this.ensureLoaded();
    return [...this.packages.values()];
  }

  has(packageId: string): boolean {
    this.ensureLoaded();
    return this.packages.has(packageId);
  }

  private async loadFromRepository(): Promise<void> {
    const records = await this.repository.list();
    const packages = new Map<string, InstalledPackage>();
    const referenceOwners = new Map<string, readonly string[]>();
    const trustDecisions = new Map<string, MarketInstallationRecord['trustDecision']>();
    for (const record of records) {
      packages.set(record.packageId, this.toInstalledPackage(record));
      referenceOwners.set(record.packageId, [...record.referenceOwners]);
      trustDecisions.set(record.packageId, record.trustDecision);
    }
    this.packages.clear();
    this.referenceOwners.clear();
    this.trustDecisions.clear();
    for (const [packageId, pkg] of packages) this.packages.set(packageId, pkg);
    for (const [packageId, owners] of referenceOwners) {
      this.referenceOwners.set(packageId, owners);
    }
    for (const [packageId, decision] of trustDecisions) {
      this.trustDecisions.set(packageId, decision);
    }
    this.loaded = true;
  }

  private async persist(
    pkg: InstalledPackage,
    referenceOwners: readonly string[],
    trustDecision: MarketInstallationRecord['trustDecision'],
  ): Promise<void> {
    const record = this.toRecord(pkg, referenceOwners, trustDecision);
    await this.repository.upsert(record);
    this.packages.set(pkg.packageId, pkg);
    this.referenceOwners.set(pkg.packageId, [...referenceOwners]);
    this.trustDecisions.set(pkg.packageId, trustDecision);
  }

  private toRecord(
    pkg: InstalledPackage,
    referenceOwners: readonly string[],
    trustDecision: MarketInstallationRecord['trustDecision'],
  ): MarketInstallationRecord {
    const installLocation = this.pathResolver.contract(pkg.installedPath);
    if (isAbsolutePath(installLocation)) {
      throw new Error(
        `Market installation path is outside configured portable roots: ${pkg.installedPath}`,
      );
    }
    return {
      packageId: pkg.packageId,
      version: pkg.version,
      type: pkg.type,
      installedAt: pkg.installedAt,
      installLocation,
      manifest: pkg.manifest,
      source: pkg.source ?? null,
      enabled: pkg.enabled,
      requested: pkg.requested ?? true,
      status: pkg.status ?? 'active',
      expiresAt: pkg.expiresAt ?? null,
      graceEndsAt: pkg.graceEndsAt ?? null,
      lastUsedAt: pkg.lastUsedAt ?? null,
      compatibilityIssue: pkg.compatibilityIssue ?? null,
      largeAsset: pkg.largeAsset ?? null,
      referenceOwners: [...referenceOwners],
      trustDecision,
      updatedAt: this.now(),
    };
  }

  private toInstalledPackage(record: MarketInstallationRecord): InstalledPackage {
    const installedPath = this.pathResolver.resolve(record.installLocation);
    if (this.pathResolver.hasVariable(installedPath) || !isAbsolutePath(installedPath)) {
      throw new Error(
        `Market installation location cannot be resolved by this Host: ${record.installLocation}`,
      );
    }
    return {
      packageId: record.packageId,
      version: record.version,
      type: record.type,
      installedAt: record.installedAt,
      installedPath,
      manifest: record.manifest,
      ...(record.source ? { source: record.source } : {}),
      enabled: record.enabled,
      requested: record.requested,
      status: record.status,
      ...(record.expiresAt !== null ? { expiresAt: record.expiresAt } : {}),
      ...(record.graceEndsAt !== null ? { graceEndsAt: record.graceEndsAt } : {}),
      ...(record.lastUsedAt !== null ? { lastUsedAt: record.lastUsedAt } : {}),
      ...(record.compatibilityIssue ? { compatibilityIssue: record.compatibilityIssue } : {}),
      ...(record.largeAsset ? { largeAsset: record.largeAsset } : {}),
    };
  }

  private createCurrentTrustDecision(): MarketInstallationRecord['trustDecision'] {
    const level = this.options.getTrustLevel?.();
    return level ? { level, source: this.options.trustSource, decidedAt: this.now() } : null;
  }

  private requirePackage(packageId: string): InstalledPackage {
    const pkg = this.packages.get(packageId);
    if (!pkg) throw new Error(`Installed package does not exist: ${packageId}`);
    return pkg;
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('Installed package registry must be loaded before use');
    }
  }
}

function isAbsolutePath(value: string): boolean {
  const normalized = value.replace(/\\/gu, '/');
  return (
    normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith('//')
  );
}
