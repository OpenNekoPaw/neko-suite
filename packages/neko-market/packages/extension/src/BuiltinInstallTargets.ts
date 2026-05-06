import * as os from 'os';
import * as path from 'path';
import type { AssetManifest, AssetType, IInstallTarget } from '@neko/shared';
import { resolveGlobalStorageLayout } from '@neko/shared';

const layout = resolveGlobalStorageLayout(os.homedir());

type BuiltinAssetType = Extract<AssetType, 'media' | 'starter' | 'preset' | 'bundle'>;

abstract class BaseBuiltinInstallTarget<T extends BuiltinAssetType> implements IInstallTarget<T> {
  abstract readonly type: T;

  constructor(private readonly baseDir: string) {}

  getInstallPath(manifest: AssetManifest): string {
    this.validateType(manifest);
    return path.join(
      this.baseDir,
      this.getKind(manifest),
      this.getPublisher(manifest),
      manifest.name,
    );
  }

  validateManifest(manifest: AssetManifest): void {
    this.validateType(manifest);
  }

  protected getKind(_manifest: AssetManifest): string {
    return 'generic';
  }

  private validateType(manifest: AssetManifest): void {
    if (manifest.type !== this.type) {
      throw new Error(`${this.constructor.name} cannot install asset type: ${manifest.type}`);
    }
  }

  private getPublisher(manifest: AssetManifest): string {
    return manifest.distribution?.publisherId ?? 'unknown';
  }
}

export class MediaInstallTarget extends BaseBuiltinInstallTarget<'media'> {
  readonly type = 'media' as const;

  constructor(baseDir = path.join(layout.root, 'media')) {
    super(baseDir);
  }

  protected override getKind(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    return metadata?.type === 'media' ? metadata.data.mediaKind : 'generic';
  }
}

export class StarterInstallTarget extends BaseBuiltinInstallTarget<'starter'> {
  readonly type = 'starter' as const;

  constructor(baseDir = path.join(layout.root, 'starters')) {
    super(baseDir);
  }

  protected override getKind(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    return metadata?.type === 'starter' ? metadata.data.targetEditor : 'generic';
  }
}

export class PresetInstallTarget extends BaseBuiltinInstallTarget<'preset'> {
  readonly type = 'preset' as const;

  constructor(baseDir = path.join(layout.root, 'presets')) {
    super(baseDir);
  }

  protected override getKind(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    return metadata?.type === 'preset' ? metadata.data.presetKind : 'generic';
  }
}

export class BundleInstallTarget extends BaseBuiltinInstallTarget<'bundle'> {
  readonly type = 'bundle' as const;

  constructor(baseDir = path.join(layout.root, 'bundles')) {
    super(baseDir);
  }

  override validateManifest(manifest: AssetManifest): void {
    super.validateManifest(manifest);
    if (manifest.distributionKind !== 'orchestration') {
      throw new Error('bundle packages must use orchestration distribution');
    }
    if (!manifest.contents || manifest.contents.length === 0) {
      throw new Error('bundle packages must declare contents');
    }
  }
}

export function createBuiltinInstallTargets(): IInstallTarget<BuiltinAssetType>[] {
  return [
    new MediaInstallTarget(),
    new StarterInstallTarget(),
    new PresetInstallTarget(),
    new BundleInstallTarget(),
  ];
}
