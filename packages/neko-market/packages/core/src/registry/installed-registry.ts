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
  AssetTypeMetadata,
  BundleMetadata,
  EndpointMetadata,
  IdentityMetadata,
  MediaMetadata,
  ModelMetadata,
  PluginMetadata,
  PresetMetadata,
  ProviderMetadata,
  ShaderMetadata,
  SkillMetadata,
  StarterMetadata,
  InstalledPackage,
  InstalledPackageRefState,
  InstalledRegistryData,
} from '@neko/shared';
import { getLegacyAssetTypeMigration, isAssetType } from '@neko/shared';

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

  const parsedVersion = typeof value['version'] === 'number' ? value['version'] : 0;
  if (parsedVersion > REGISTRY_VERSION) {
    throw new UnsupportedInstalledRegistryVersionError(parsedVersion);
  }

  let data = normalizeLegacyRegistryData(value, parsedVersion);
  if (parsedVersion < 1) {
    data = migrateV0ToV1(data);
  }
  data = backfillV1RecordDefaults(data);
  data.version = REGISTRY_VERSION;
  return data;
}

function normalizeLegacyRegistryData(
  value: Record<string, unknown>,
  version: number,
): InstalledRegistryData {
  const packages = isRecord(value['packages'])
    ? (value['packages'] as Record<string, InstalledPackage>)
    : {};
  const refs = isRecord(value['refs'])
    ? (value['refs'] as Record<string, InstalledPackageRefState>)
    : {};
  return { version, packages, refs };
}

function migrateV0ToV1(data: InstalledRegistryData): InstalledRegistryData {
  data.refs ??= {};
  return backfillV1RecordDefaults(data);
}

function backfillV1RecordDefaults(data: InstalledRegistryData): InstalledRegistryData {
  data.refs ??= {};
  for (const [packageId, pkg] of Object.entries(data.packages)) {
    pkg.packageId ||= packageId;
    migrateLegacyPackageType(pkg);
    pkg.enabled ??= true;
    pkg.requested ??= true;
    pkg.status ??= 'active';
  }
  return data;
}

function migrateLegacyPackageType(pkg: InstalledPackage): void {
  const legacyType = getLegacyPackageType(pkg);
  if (!legacyType) return;

  const migration = getLegacyAssetTypeMigration(legacyType);
  if (!migration) return;

  pkg.type = migration.type;
  pkg.manifest = migrateLegacyManifestType(pkg.manifest, migration.type, migration.metadataPatch);
}

function getLegacyPackageType(pkg: InstalledPackage): string | undefined {
  if (typeof pkg.type === 'string' && !isAssetType(pkg.type)) return pkg.type;
  const manifestType = (pkg.manifest as { type?: unknown } | undefined)?.type;
  if (typeof manifestType === 'string' && !isAssetType(manifestType)) return manifestType;
  return undefined;
}

function migrateLegacyManifestType(
  manifest: AssetManifest,
  type: AssetManifest['type'],
  metadataPatch: { type: AssetTypeMetadata['type']; data?: Record<string, unknown> },
): AssetManifest {
  return {
    ...manifest,
    type,
    typeMetadata: buildMigratedTypeMetadata(manifest, metadataPatch),
  };
}

function buildMigratedTypeMetadata(
  manifest: AssetManifest,
  metadataPatch: { type: AssetTypeMetadata['type']; data?: Record<string, unknown> },
): AssetTypeMetadata {
  const currentMetadata = isRecord((manifest as { typeMetadata?: unknown }).typeMetadata)
    ? (manifest as { typeMetadata: Record<string, unknown> }).typeMetadata
    : undefined;
  const currentData = isRecord(currentMetadata?.['data']) ? currentMetadata['data'] : {};
  const patchData = metadataPatch.data ?? {};
  const data = { ...currentData, ...patchData };

  switch (metadataPatch.type) {
    case 'media': {
      const mediaKind = readEnum(
        data['mediaKind'],
        ['video', 'audio', 'image', 'sequence', '3d-model', 'puppet-motion', 'document'] as const,
        'image',
      );
      const mediaData: MediaMetadata = {
        mediaKind,
        fileSize: readNumber(data['fileSize'], 0),
      };
      return { type: 'media', data: mediaData };
    }
    case 'starter':
      return {
        type: 'starter',
        data: {
          targetEditor: readEnum(
            data['targetEditor'],
            ['cut', 'canvas', 'model', 'sketch', 'puppet', 'story'] as const,
            'cut',
          ),
        } satisfies StarterMetadata,
      };
    case 'identity':
      return {
        type: 'identity',
        data: {
          identityKind: readEnum(
            data['identityKind'],
            ['character', 'location', 'object', 'style'] as const,
            'character',
          ),
          identityId: readString(data['identityId'], manifest.id),
          forms: [],
        } satisfies IdentityMetadata,
      };
    case 'model':
      return {
        type: 'model',
        data: {
          modelKind: readEnum(data['modelKind'], ['base', 'lora', 'embedding'] as const, 'base'),
          framework: readEnum(
            data['framework'],
            ['onnx', 'pytorch', 'safetensors', 'gguf'] as const,
            'onnx',
          ),
          task: readString(data['task'], 'unknown'),
          size: readNumber(data['size'], 0),
          quantization: readOptionalString(data['quantization']),
          minVram: readOptionalNumber(data['minVram']),
          architecture: readOptionalString(data['architecture']),
          baseModel: readOptionalString(data['baseModel']),
        } satisfies ModelMetadata,
      };
    case 'endpoint':
      return {
        type: 'endpoint',
        data: {
          provider: readEnum(
            data['provider'],
            ['openai', 'anthropic', 'google', 'azure', 'ollama', 'comfyui', 'custom'] as const,
            'custom',
          ),
          capabilities: readStringArray(data['capabilities']),
          endpointTemplate: readString(data['endpointTemplate'], ''),
          credentialSchema: { fields: [] },
          modelIds: readStringArray(data['modelIds']),
        } satisfies EndpointMetadata,
      };
    case 'provider':
      return {
        type: 'provider',
        data: {
          providerId: readString(data['providerId'], manifest.id),
          capabilities: readStringArray(data['capabilities']),
          modelIds: readStringArray(data['modelIds']),
          cardSchemaVersion: readOptionalString(data['cardSchemaVersion']),
        } satisfies ProviderMetadata,
      };
    case 'skill':
      return {
        type: 'skill',
        data: {
          domain: readStringArray(data['domain']),
          toolSets: readStringArray(data['toolSets']),
          mcpServers: readStringArray(data['mcpServers']),
        } satisfies SkillMetadata,
      };
    case 'plugin':
      return {
        type: 'plugin',
        data: {
          entryPoint: readString(data['entryPoint'], ''),
          apiVersion: readString(data['apiVersion'], '1'),
          permissions: readStringArray(data['permissions']),
        } satisfies PluginMetadata,
      };
    case 'shader':
      return {
        type: 'shader',
        data: {
          shaderKind: readEnum(data['shaderKind'], ['standalone', 'preset'] as const, 'standalone'),
          language: readEnum(data['language'], ['wgsl', 'glsl'] as const, 'wgsl'),
          stage: readEnum(data['stage'], ['vertex', 'fragment', 'compute'] as const, 'fragment'),
          inputs: [],
          preview: readOptionalString(data['preview']),
          compatibleWith: readStringArray(data['compatibleWith']),
        } satisfies ShaderMetadata,
      };
    case 'preset':
      return {
        type: 'preset',
        data: {
          presetKind: readString(data['presetKind'], 'theme'),
          targetApp: readOptionalString(data['targetApp']),
        } satisfies PresetMetadata,
      };
    case 'bundle':
      return {
        type: 'bundle',
        data: {
          installPolicy: readEnum(data['installPolicy'], ['all', 'pick'] as const, 'all'),
          recommended: readStringArray(data['recommended']),
        } satisfies BundleMetadata,
      };
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
