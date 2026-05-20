import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

export type PuppetMediaInstallKind = 'puppet-model' | 'puppet-motion' | 'puppet-config';

const MARKET_PUPPET_PRESET_ROOT = path.join(os.homedir(), '.neko', 'presets');

abstract class BasePuppetMediaInstallTarget implements IInstallTarget<'media'> {
  readonly type = 'media' as const;

  protected constructor(
    private readonly mediaKind: PuppetMediaInstallKind,
    private readonly baseDir: string,
    private readonly reloadPresets?: () => Promise<void>,
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
    await this.reloadPresets?.().catch(() => undefined);
  }
}

export class PuppetModelInstallTarget extends BasePuppetMediaInstallTarget {
  constructor(
    baseDir = path.join(MARKET_PUPPET_PRESET_ROOT, 'puppet-model'),
    reloadPresets?: () => Promise<void>,
  ) {
    super('puppet-model', baseDir, reloadPresets);
  }
}

export class PuppetMotionInstallTarget extends BasePuppetMediaInstallTarget {
  constructor(
    baseDir = path.join(MARKET_PUPPET_PRESET_ROOT, 'puppet-motion'),
    reloadPresets?: () => Promise<void>,
  ) {
    super('puppet-motion', baseDir, reloadPresets);
  }
}

export class PuppetConfigInstallTarget extends BasePuppetMediaInstallTarget {
  constructor(
    baseDir = path.join(MARKET_PUPPET_PRESET_ROOT, 'puppet-config'),
    reloadPresets?: () => Promise<void>,
  ) {
    super('puppet-config', baseDir, reloadPresets);
  }
}
