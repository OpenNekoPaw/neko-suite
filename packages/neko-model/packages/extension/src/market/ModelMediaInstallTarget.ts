import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

export type ModelMediaInstallKind = 'model-2d-scene' | 'model-3d' | 'model-motion' | 'model-config';

const MARKET_MODEL_ROOT = path.join(os.homedir(), '.neko', 'models');

abstract class BaseModelMediaInstallTarget implements IInstallTarget<'media'> {
  readonly type = 'media' as const;

  protected constructor(
    private readonly mediaKind: ModelMediaInstallKind,
    private readonly baseDir: string,
    private readonly reloadAssets?: () => Promise<void>,
  ) {}

  validateManifest(manifest: AssetManifest): void {
    const metadata = manifest.typeMetadata;
    if (manifest.type !== 'media' || metadata?.type !== 'media') {
      throw new Error(`${this.constructor.name} cannot install asset type: ${manifest.type}`);
    }
    if (metadata.data.mediaKind !== this.mediaKind) {
      throw new Error(
        `${this.constructor.name} cannot install media kind: ${metadata.data.mediaKind}`,
      );
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    this.validateManifest(manifest);
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(this.baseDir, publisherId, manifest.name);
  }

  async onPostInstall(_manifest: AssetManifest, _installedPath: string): Promise<void> {
    await this.reloadAssets?.().catch(() => undefined);
  }
}

export class ModelAssetInstallTarget extends BaseModelMediaInstallTarget {
  constructor(baseDir = path.join(MARKET_MODEL_ROOT, '3d'), reloadAssets?: () => Promise<void>) {
    super('model-3d', baseDir, reloadAssets);
  }
}

export class ModelScene2DInstallTarget extends BaseModelMediaInstallTarget {
  constructor(
    baseDir = path.join(MARKET_MODEL_ROOT, '2d-scene'),
    reloadAssets?: () => Promise<void>,
  ) {
    super('model-2d-scene', baseDir, reloadAssets);
  }
}

export class ModelMotionInstallTarget extends BaseModelMediaInstallTarget {
  constructor(
    baseDir = path.join(MARKET_MODEL_ROOT, '3d-motion'),
    reloadAssets?: () => Promise<void>,
  ) {
    super('model-motion', baseDir, reloadAssets);
  }
}

export class ModelConfigInstallTarget extends BaseModelMediaInstallTarget {
  constructor(
    baseDir = path.join(MARKET_MODEL_ROOT, '3d-config'),
    reloadAssets?: () => Promise<void>,
  ) {
    super('model-config', baseDir, reloadAssets);
  }
}
