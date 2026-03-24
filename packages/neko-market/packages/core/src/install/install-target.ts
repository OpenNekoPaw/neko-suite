/**
 * InstallTargetRegistry — Registry of type-specific install targets.
 *
 * Each asset type registers an IInstallTarget that determines where
 * packages are installed and provides lifecycle hooks.
 */

import type { AssetType } from '@neko/shared/types/asset/manifest';
import type { IInstallTarget } from '@neko/shared/types/asset/market';

// =============================================================================
// Registry
// =============================================================================

/**
 * Registry for install targets, keyed by AssetType.
 *
 * Consumers register targets at startup; InstallManager queries
 * the registry during install to find the target for a given type.
 */
export class InstallTargetRegistry {
  private readonly targets = new Map<AssetType, IInstallTarget>();

  /** Register a target for an asset type */
  register<T extends AssetType>(target: IInstallTarget<T>): void {
    this.targets.set(target.type, target);
  }

  /** Get the target for an asset type */
  get(type: AssetType): IInstallTarget | undefined {
    return this.targets.get(type);
  }

  /** Check if a target is registered for the type */
  has(type: AssetType): boolean {
    return this.targets.has(type);
  }

  /** List all registered types */
  registeredTypes(): AssetType[] {
    return Array.from(this.targets.keys());
  }
}
