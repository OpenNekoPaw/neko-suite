/**
 * InstalledRegistry — Local persistence of installed packages.
 *
 * Manages `~/.neko/market-installed.json` as the source of truth
 * for what marketplace packages are currently installed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  AssetManifest,
  InstalledPackage,
  InstalledPackageRefState,
  InstalledRegistryData,
} from '@neko/shared';
import { isAssetType } from '@neko/shared';

export interface RemovedReferenceState {
  packageId: string;
  previous: InstalledPackageRefState;
  next?: InstalledPackageRefState;
}

// =============================================================================
// Constants
// =============================================================================

const REGISTRY_VERSION = 1;

// =============================================================================
// Implementation
// =============================================================================

export class InstalledRegistry {
  private data: InstalledRegistryData | undefined;
  private _loadPromise: Promise<void> | undefined;

  constructor(private readonly filePath: string) {}

  /** Load the registry from disk */
  async load(): Promise<void> {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._doLoad();
    return this._loadPromise;
  }

  /** Wait until the registry is loaded (call before accessing data) */
  async ready(): Promise<void> {
    if (this.data) return;
    if (this._loadPromise) return this._loadPromise;
    return this.load();
  }

  private async _doLoad(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      this.data = migrateInstalledRegistryData(JSON.parse(content) as unknown);
    } catch (error) {
      if (error instanceof UnsupportedInstalledRegistryVersionError) {
        throw error;
      }
      this.data = { version: REGISTRY_VERSION, packages: {}, refs: {} };
    }
  }

  /** Save the registry to disk */
  async save(): Promise<void> {
    this.ensureLoaded();
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  /** Add or update an installed package record */
  async add(pkg: InstalledPackage): Promise<void> {
    this.ensureLoaded();
    // Ensure enabled defaults to true for new records.
    this.data!.packages[pkg.packageId] = { ...pkg, enabled: pkg.enabled ?? true };
    await this.save();
  }

  async setRequested(packageId: string, requested: boolean): Promise<void> {
    this.ensureLoaded();
    const pkg = this.data!.packages[packageId];
    if (!pkg) return;
    pkg.requested = requested;
    await this.save();
  }

  async update(
    packageId: string,
    updater: (pkg: InstalledPackage) => InstalledPackage,
  ): Promise<InstalledPackage | undefined> {
    this.ensureLoaded();
    const current = this.data!.packages[packageId];
    if (!current) return undefined;
    const next = updater(current);
    this.data!.packages[packageId] = next;
    await this.save();
    return next;
  }

  /** Set the enabled state of an installed package */
  async setEnabled(packageId: string, enabled: boolean): Promise<void> {
    this.ensureLoaded();
    const pkg = this.data!.packages[packageId];
    if (!pkg) return;
    pkg.enabled = enabled;
    await this.save();
  }

  /** Remove an installed package record */
  async remove(packageId: string): Promise<void> {
    this.ensureLoaded();
    delete this.data!.packages[packageId];
    delete this.data!.refs?.[packageId];
    this.removeOwnerFromAllReferences(packageId);
    await this.save();
  }

  async addReference(packageId: string, ownerPackageId: string): Promise<InstalledPackageRefState> {
    this.ensureLoaded();
    const refs = (this.data!.refs ??= {});
    const current = refs[packageId] ?? { refCount: 0, owners: [] };
    if (!current.owners.includes(ownerPackageId)) {
      current.owners.push(ownerPackageId);
      current.refCount += 1;
    }
    refs[packageId] = current;
    await this.save();
    return current;
  }

  async removeReference(
    packageId: string,
    ownerPackageId: string,
  ): Promise<InstalledPackageRefState | undefined> {
    this.ensureLoaded();
    const refs = (this.data!.refs ??= {});
    const current = refs[packageId];
    if (!current) return undefined;
    const owners = current.owners.filter((owner) => owner !== ownerPackageId);
    if (owners.length === current.owners.length) return current;
    if (owners.length === 0) {
      delete refs[packageId];
      await this.save();
      return undefined;
    }
    const next = { refCount: owners.length, owners };
    refs[packageId] = next;
    await this.save();
    return next;
  }

  async removeOwnerReferences(
    ownerPackageId: string,
    packageIds?: readonly string[],
  ): Promise<RemovedReferenceState[]> {
    this.ensureLoaded();
    const refs = (this.data!.refs ??= {});
    const ids = packageIds ?? Object.keys(refs);
    const removed: RemovedReferenceState[] = [];

    for (const packageId of ids) {
      const current = refs[packageId];
      if (!current || !current.owners.includes(ownerPackageId)) continue;

      const owners = current.owners.filter((owner) => owner !== ownerPackageId);
      if (owners.length === 0) {
        delete refs[packageId];
        removed.push({ packageId, previous: current });
        continue;
      }

      const next = { refCount: owners.length, owners };
      refs[packageId] = next;
      removed.push({ packageId, previous: current, next });
    }

    if (removed.length > 0) {
      await this.save();
    }
    return removed;
  }

  getReference(packageId: string): InstalledPackageRefState | undefined {
    this.ensureLoaded();
    return this.data!.refs?.[packageId];
  }

  /** Get a single installed package */
  get(packageId: string): InstalledPackage | undefined {
    this.ensureLoaded();
    return this.data!.packages[packageId];
  }

  /** List all installed packages */
  list(): InstalledPackage[] {
    this.ensureLoaded();
    return Object.values(this.data!.packages);
  }

  /** Check if a package is installed */
  has(packageId: string): boolean {
    this.ensureLoaded();
    return packageId in this.data!.packages;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private ensureLoaded(): void {
    if (!this.data) {
      this.data = { version: REGISTRY_VERSION, packages: {}, refs: {} };
    }
    this.data.refs ??= {};
    this.data.version = REGISTRY_VERSION;
  }

  private removeOwnerFromAllReferences(ownerPackageId: string): void {
    const refs = this.data?.refs;
    if (!refs) return;
    for (const [packageId, current] of Object.entries(refs)) {
      if (!current.owners.includes(ownerPackageId)) continue;
      const owners = current.owners.filter((owner) => owner !== ownerPackageId);
      if (owners.length === 0) {
        delete refs[packageId];
      } else {
        refs[packageId] = { refCount: owners.length, owners };
      }
    }
  }
}

export class UnsupportedInstalledRegistryVersionError extends Error {
  constructor(readonly version: number) {
    super(`Unsupported installed registry version: ${version}`);
    this.name = 'UnsupportedInstalledRegistryVersionError';
  }
}

function migrateInstalledRegistryData(value: unknown): InstalledRegistryData {
  if (!isRecord(value)) {
    return { version: REGISTRY_VERSION, packages: {}, refs: {} };
  }

  const parsedVersion = typeof value['version'] === 'number' ? value['version'] : undefined;
  if (parsedVersion === undefined || parsedVersion < REGISTRY_VERSION) {
    return { version: REGISTRY_VERSION, packages: {}, refs: {} };
  }
  if (parsedVersion > REGISTRY_VERSION) {
    throw new UnsupportedInstalledRegistryVersionError(parsedVersion);
  }

  const data = backfillV1RecordDefaults(readRegistryData(value, parsedVersion));
  data.version = REGISTRY_VERSION;
  return data;
}

function readRegistryData(value: Record<string, unknown>, version: number): InstalledRegistryData {
  const packages = readInstalledPackageRecords(value['packages']);
  const refs = isRecord(value['refs'])
    ? (value['refs'] as Record<string, InstalledPackageRefState>)
    : {};
  return { version, packages, refs };
}

function readInstalledPackageRecords(value: unknown): Record<string, InstalledPackage> {
  if (!isRecord(value)) return {};

  const packages: Record<string, InstalledPackage> = {};
  for (const [packageId, entry] of Object.entries(value)) {
    const normalized = readInstalledPackageRecord(packageId, entry);
    if (normalized) {
      packages[packageId] = normalized;
    }
  }
  return packages;
}

function readInstalledPackageRecord(
  expectedPackageId: string,
  value: unknown,
): InstalledPackage | undefined {
  if (!isRecord(value)) return undefined;
  const manifest = readCanonicalInstalledManifest(value['manifest']);
  if (!manifest) return undefined;

  const type = value['type'] ?? manifest.type;
  if (!isAssetType(type) || type !== manifest.type) return undefined;
  if (typeof value['version'] !== 'string' || value['version'].length === 0) return undefined;
  if (typeof value['installedAt'] !== 'number' || !Number.isFinite(value['installedAt'])) {
    return undefined;
  }
  if (typeof value['installedPath'] !== 'string' || value['installedPath'].length === 0) {
    return undefined;
  }
  if (typeof value['packageId'] !== 'string' || value['packageId'].length === 0) {
    return undefined;
  }
  if (value['packageId'] !== expectedPackageId) return undefined;

  return {
    ...(value as InstalledPackage),
    packageId: value['packageId'],
    version: value['version'],
    type,
    installedAt: value['installedAt'],
    installedPath: value['installedPath'],
    manifest,
    enabled: value['enabled'] === undefined ? true : value['enabled'] === true,
  };
}

function readCanonicalInstalledManifest(value: unknown): AssetManifest | undefined {
  if (!isRecord(value) || !isAssetType(value['type'])) return undefined;
  return value as AssetManifest;
}

function backfillV1RecordDefaults(data: InstalledRegistryData): InstalledRegistryData {
  data.refs ??= {};
  for (const [packageId, pkg] of Object.entries(data.packages)) {
    pkg.packageId ||= packageId;
    pkg.enabled ??= true;
    pkg.requested ??= true;
    pkg.status ??= 'active';
    pkg.source ??= inferInstalledPackageSource(pkg);
  }
  return data;
}

function inferInstalledPackageSource(pkg: InstalledPackage): InstalledPackage['source'] {
  const source = pkg.manifest.source;
  if (source.kind === 'registry') {
    return { kind: 'market', path: pkg.installedPath };
  }
  if (source.kind === 'local') {
    return {
      kind: 'local',
      storageMode: source.storageMode ?? 'copy-managed',
      path: source.path,
    };
  }
  if (source.kind === 'local-link') {
    return {
      kind: 'local-link',
      storageMode: 'local-link',
      path: source.path,
      originalPath: source.path,
    };
  }
  if (source.kind === 'ai-generated') {
    return { kind: 'ai-generated', path: pkg.installedPath };
  }
  return { kind: 'market', path: pkg.installedPath };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
