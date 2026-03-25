/**
 * PresetInstallTarget — Install target for marketplace presets, templates, and LUTs.
 *
 * Installs to ~/.neko/presets/{presetType}/{name}/
 * presetType is derived from manifest typeMetadata (export/color/transition/effect/lut/template),
 * falling back to manifest.type when not specified.
 *
 * Handles: 'preset', 'template', 'lut'
 */

import * as os from 'os';
import * as path from 'path';
import type { AssetManifest, AssetType } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';

/** Base directory for marketplace-installed presets */
const MARKET_PRESETS_BASE = path.join(os.homedir(), '.neko', 'presets');

/** Handles 'preset', 'template', and 'lut' asset types */
export class PresetInstallTarget implements IInstallTarget<'preset' | 'template' | 'lut'> {
  constructor(public readonly type: 'preset' | 'template' | 'lut') {}

  /**
   * Compute install path: ~/.neko/presets/{presetType}/{name}/
   * presetType comes from typeMetadata.data.presetType, or falls back to manifest.type.
   */
  getInstallPath(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    const presetType = metadata?.type === 'preset' ? metadata.data.presetType : manifest.type;
    return path.join(MARKET_PRESETS_BASE, presetType, manifest.name);
  }
}
