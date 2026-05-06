/**
 * InstallTargetRegistry — Registry of type-specific install targets.
 *
 * Each asset type registers an IInstallTarget that determines where
 * packages are installed and provides lifecycle hooks.
 */

import type { AssetManifest, AssetType, IInstallTarget } from '@neko/shared';

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
  private readonly targets = new Map<string, IInstallTarget>();
  private readonly routeTypes = new Map<string, AssetType>();

  /** Register a target for an asset type */
  register<T extends AssetType>(target: IInstallTarget<T>, kind?: string): void {
    const key = routeKey(target.type, kind);
    this.targets.set(key, target);
    this.routeTypes.set(key, target.type);
  }

  /** Get the target for an asset type */
  get(type: AssetType, kind?: string): IInstallTarget | undefined {
    return this.targets.get(routeKey(type, kind)) ?? this.targets.get(routeKey(type));
  }

  /** Resolve the best target for a manifest, preferring type-kind routes. */
  getForManifest(manifest: AssetManifest): IInstallTarget | undefined {
    return this.get(manifest.type, getManifestKind(manifest));
  }

  /** Remove a target route. */
  unregister(type: AssetType, kind?: string): void {
    const key = routeKey(type, kind);
    this.targets.delete(key);
    this.routeTypes.delete(key);
  }

  /** Check if a target is registered for the type */
  has(type: AssetType, kind?: string): boolean {
    return this.get(type, kind) !== undefined;
  }

  /** List all registered types */
  registeredTypes(): AssetType[] {
    return Array.from(new Set(this.routeTypes.values()));
  }

  /** Clear all live target registrations. */
  clear(): void {
    this.targets.clear();
    this.routeTypes.clear();
  }
}

function routeKey(type: AssetType, kind?: string): string {
  return kind ? `${type}.${kind}` : type;
}

function getManifestKind(manifest: AssetManifest): string | undefined {
  const metadata = manifest.typeMetadata;
  if (!metadata) return undefined;
  switch (metadata.type) {
    case 'media':
      return metadata.data.mediaKind;
    case 'model':
      return metadata.data.modelKind;
    case 'shader':
      return metadata.data.shaderKind;
    case 'preset':
      return metadata.data.presetKind;
    case 'identity':
      return metadata.data.identityKind;
    default:
      return undefined;
  }
}
