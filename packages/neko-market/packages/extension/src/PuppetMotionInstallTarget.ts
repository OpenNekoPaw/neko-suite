/**
 * PuppetMotionInstallTarget — Install target for marketplace puppet motion/expression presets.
 *
 * Installs to ~/.neko/presets/puppet-motion/{publisherId}/{name}/
 * After installation, fires neko.puppet.reloadPresets so neko-puppet picks up new presets.
 */

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';

const MARKET_PUPPET_MOTION_BASE = path.join(os.homedir(), '.neko', 'presets', 'puppet-motion');

export class PuppetMotionInstallTarget implements IInstallTarget<'puppet-motion'> {
  readonly type = 'puppet-motion' as const;

  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(MARKET_PUPPET_MOTION_BASE, publisherId, manifest.name);
  }

  async onPostInstall(_manifest: AssetManifest, _installedPath: string): Promise<void> {
    // Notify neko-puppet to reload presets from disk
    await vscode.commands.executeCommand('neko.puppet.reloadPresets').then(
      () => {},
      () => {}, // silently ignore if neko-puppet is not active
    );
  }
}
