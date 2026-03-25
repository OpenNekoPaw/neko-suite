/**
 * ShaderInstallTarget — Install target for marketplace shaders and shader presets.
 *
 * Installs to ~/.neko/shaders/{publisherId}/{name}/
 * Runtime registration is handled by EffectDispatcher's file watcher.
 */

import * as os from 'os';
import * as path from 'path';
import type { AssetManifest, AssetType } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';

/** Base directory for marketplace-installed shaders */
const MARKET_SHADERS_BASE = path.join(os.homedir(), '.neko', 'shaders');

/** Handles 'shader' and 'shader-preset' asset types */
export class ShaderInstallTarget implements IInstallTarget<'shader' | 'shader-preset'> {
  constructor(public readonly type: 'shader' | 'shader-preset') {}

  /**
   * Compute install path: ~/.neko/shaders/{publisherId}/{name}/
   */
  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(MARKET_SHADERS_BASE, publisherId, manifest.name);
  }
}
