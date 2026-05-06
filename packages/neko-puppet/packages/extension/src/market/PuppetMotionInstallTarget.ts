/**
 * PuppetMotionInstallTarget — kind-level target for media.puppet-motion packages.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

const MARKET_PUPPET_MOTION_BASE = path.join(os.homedir(), '.neko', 'presets', 'puppet-motion');

export class PuppetMotionInstallTarget implements IInstallTarget<'media'> {
  readonly type = 'media' as const;

  constructor(
    private readonly baseDir: string = MARKET_PUPPET_MOTION_BASE,
    private readonly reloadPresets?: () => Promise<void>,
  ) {}

  validateManifest(manifest: AssetManifest): void {
    const metadata = manifest.typeMetadata;
    if (manifest.type !== 'media' || metadata?.type !== 'media') {
      throw new Error(`PuppetMotionInstallTarget cannot install asset type: ${manifest.type}`);
    }
    if (metadata.data.mediaKind !== 'puppet-motion') {
      throw new Error(
        `PuppetMotionInstallTarget cannot install media kind: ${metadata.data.mediaKind}`,
      );
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(this.baseDir, publisherId, manifest.name);
  }

  async onPostInstall(_manifest: AssetManifest, _installedPath: string): Promise<void> {
    await this.reloadPresets?.().catch(() => undefined);
  }
}
