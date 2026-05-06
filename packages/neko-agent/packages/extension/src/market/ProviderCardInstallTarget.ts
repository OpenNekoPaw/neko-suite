/**
 * ProviderCardInstallTarget — contributed target for provider packages.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';
import { resolveGlobalStorageLayout } from '@neko/shared';

const MARKET_PROVIDER_CARDS_BASE = resolveGlobalStorageLayout(os.homedir()).providerCards;

export class ProviderCardInstallTarget implements IInstallTarget<'provider'> {
  readonly type = 'provider' as const;

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'provider') {
      throw new Error(`ProviderCardInstallTarget cannot install asset type: ${manifest.type}`);
    }

    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'provider') {
      throw new Error('provider packages must include provider typeMetadata');
    }

    const trustLevel = metadata.data.trustLevel ?? 'untrusted';
    if (trustLevel === 'untrusted') {
      throw new Error('Untrusted provider packages cannot be installed as ProviderCards');
    }

    if (
      trustLevel === 'community' &&
      !metadata.data.signature &&
      manifest.distribution?.verified !== true
    ) {
      throw new Error('Community provider packages require a signature or verified publisher');
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(MARKET_PROVIDER_CARDS_BASE, publisherId, manifest.name);
  }
}
