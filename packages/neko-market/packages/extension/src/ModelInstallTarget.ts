/**
 * ModelInstallTarget — Install target for marketplace AI models.
 *
 * Installs to ~/.neko/models/{framework}/{name}/
 * Framework is derived from manifest typeMetadata (onnx/pytorch/safetensors),
 * falling back to 'generic' when not specified.
 *
 * Handles: 'ai-model', 'lora', 'embedding'
 */

import * as os from 'os';
import * as path from 'path';
import type { AssetManifest, AssetType } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';

/** Base directory for marketplace-installed models */
const MARKET_MODELS_BASE = path.join(os.homedir(), '.neko', 'models');

/** Handles 'ai-model', 'lora', and 'embedding' asset types */
export class ModelInstallTarget implements IInstallTarget<'ai-model' | 'lora' | 'embedding'> {
  constructor(public readonly type: 'ai-model' | 'lora' | 'embedding') {}

  /**
   * Compute install path: ~/.neko/models/{framework}/{name}/
   * Framework comes from typeMetadata.data.framework or defaults to 'generic'.
   */
  getInstallPath(manifest: AssetManifest): string {
    const metadata = manifest.typeMetadata;
    const framework = metadata?.type === 'model' ? metadata.data.framework : 'generic';
    return path.join(MARKET_MODELS_BASE, framework, manifest.name);
  }
}
