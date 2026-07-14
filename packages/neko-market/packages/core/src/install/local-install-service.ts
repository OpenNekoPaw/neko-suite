import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AssetManifest, InstalledPackage, LocalAssetStorageMode } from '@neko/shared';
import { parseAssetManifest } from '@neko/shared';
import type { InstalledPackageRegistry } from '../registry/installed-package-registry';

export interface LocalInstallServiceOptions {
  nekoHome: string;
  registry: InstalledPackageRegistry;
  now?: () => number;
}

export interface LocalInstallRequest {
  manifest: AssetManifest;
  sourcePath: string;
  mode?: LocalAssetStorageMode;
  linkedVariablePath?: string;
}

export class LocalInstallService {
  private readonly now: () => number;

  constructor(private readonly options: LocalInstallServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  async install(request: LocalInstallRequest): Promise<InstalledPackage> {
    const mode = request.mode ?? 'copy-managed';
    if (mode === 'local-link') {
      return this.installLink(request);
    }
    return this.installCopy(request);
  }

  async uninstall(packageId: string): Promise<void> {
    const record = this.options.registry.get(packageId);
    if (!record) return;
    if (record.source?.storageMode === 'copy-managed') {
      await rm(record.installedPath, { recursive: true, force: true });
    }
    await this.options.registry.remove(packageId);
  }

  private async installCopy(request: LocalInstallRequest): Promise<InstalledPackage> {
    const targetDir = this.getManagedInstallDir(request.manifest);
    const sourceStat = await stat(request.sourcePath);
    const targetPath = sourceStat.isDirectory()
      ? targetDir
      : join(targetDir, basename(request.sourcePath));
    await mkdir(targetDir, { recursive: true });
    await cp(request.sourcePath, targetPath, { recursive: true });

    const manifest = parseAssetManifest({
      ...request.manifest,
      source: {
        kind: 'local',
        path: this.toNekoHomeVariablePath(targetPath),
        storageMode: 'copy-managed',
      },
      distribution: undefined,
    });

    const record = this.createRecord(manifest, targetPath, 'copy-managed');
    await this.options.registry.add(record);
    return record;
  }

  private async installLink(request: LocalInstallRequest): Promise<InstalledPackage> {
    const variablePath = request.linkedVariablePath ?? request.sourcePath;
    const manifest = parseAssetManifest({
      ...request.manifest,
      source: {
        kind: 'local-link',
        path: variablePath,
        storageMode: 'local-link',
      },
      distribution: undefined,
    });
    const record = this.createRecord(manifest, request.sourcePath, 'local-link');
    await this.options.registry.add(record);
    return record;
  }

  private createRecord(
    manifest: AssetManifest,
    installedPath: string,
    storageMode: LocalAssetStorageMode,
  ): InstalledPackage {
    return {
      packageId: manifest.id,
      version: manifest.version,
      type: manifest.type,
      installedAt: this.now(),
      installedPath,
      manifest,
      source: {
        kind: storageMode === 'local-link' ? 'local-link' : 'local',
        storageMode,
        path:
          manifest.source.kind === 'local' || manifest.source.kind === 'local-link'
            ? manifest.source.path
            : installedPath,
        originalPath:
          storageMode === 'local-link' &&
          (manifest.source.kind === 'local' || manifest.source.kind === 'local-link')
            ? manifest.source.path
            : undefined,
      },
      enabled: true,
      requested: true,
      status: 'active',
    };
  }

  private getManagedInstallDir(manifest: AssetManifest): string {
    return join(
      this.options.nekoHome,
      'local',
      manifest.type,
      sanitizePathSegment(manifest.id),
      manifest.version,
    );
  }

  private toNekoHomeVariablePath(path: string): string {
    return path.startsWith(this.options.nekoHome)
      ? path.replace(this.options.nekoHome, '${NEKO_HOME}')
      : path;
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'local-asset';
}
