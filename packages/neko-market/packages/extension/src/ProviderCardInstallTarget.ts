/**
 * ProviderCardInstallTarget — Install target for Provider Expression Context cards.
 *
 * Installs to ~/.neko/providers/{publisherId}/{name}/ so the agent extension
 * can recursively scan marketplace-installed provider cards as the market layer.
 */

import * as os from 'os';
import * as path from 'path';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';
import { resolveGlobalStorageLayout } from '@neko/shared';

const MARKET_PROVIDER_CARDS_BASE = resolveGlobalStorageLayout(os.homedir()).providerCards;

export class ProviderCardInstallTarget implements IInstallTarget<'provider-card'> {
  readonly type = 'provider-card' as const;

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'provider-card') {
      throw new Error(`ProviderCardInstallTarget cannot install asset type: ${manifest.type}`);
    }

    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'provider-card') {
      throw new Error('provider-card packages must include provider-card typeMetadata');
    }

    const trustLevel = metadata.data.trustLevel ?? 'untrusted';
    if (trustLevel === 'untrusted') {
      throw new Error(
        'Untrusted provider-card packages cannot be installed as market ProviderCards',
      );
    }

    // FIXME(provider-card): signature presence-check only; cryptographic verification pending.
    if (
      trustLevel === 'community' &&
      !metadata.data.signature &&
      manifest.distribution?.verified !== true
    ) {
      throw new Error('Community provider-card packages require a signature or verified publisher');
    }
  }

  /**
   * Compute install path: ~/.neko/providers/{publisherId}/{packageName}/
   */
  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    return path.join(MARKET_PROVIDER_CARDS_BASE, publisherId, manifest.name);
  }
}
