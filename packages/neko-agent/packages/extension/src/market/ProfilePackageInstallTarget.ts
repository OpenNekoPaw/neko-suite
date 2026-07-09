/**
 * ProfilePackageInstallTarget — contributed target for Agent profile packages.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';
import { resolveGlobalStorageLayout } from '@neko/shared';

const MARKET_PROFILES_BASE = resolveGlobalStorageLayout(os.homedir()).profiles;

export interface ProfilePackageInstallTargetHost {
  refreshProfiles?(): Promise<void>;
}

export class ProfilePackageInstallTarget implements IInstallTarget<'profile'> {
  readonly type = 'profile' as const;

  constructor(
    private readonly profilesBaseDir: string = MARKET_PROFILES_BASE,
    private readonly host?: ProfilePackageInstallTargetHost,
  ) {}

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'profile') {
      throw new Error(`ProfilePackageInstallTarget cannot install asset type: ${manifest.type}`);
    }

    const metadata = manifest.typeMetadata;
    if (metadata?.type !== 'profile') {
      throw new Error('profile packages must include profile typeMetadata');
    }

    if (!metadata.data.profiles.length) {
      throw new Error('profile packages must declare at least one profile descriptor');
    }

    for (const profile of metadata.data.profiles) {
      if (profile.descriptorPath !== undefined && !isPackageRelativePath(profile.descriptorPath)) {
        throw new Error('profile descriptorPath must stay inside the installed package');
      }
    }

    const trustLevel = metadata.data.trustLevel ?? manifest.distribution?.trustLevel ?? 'untrusted';
    if (trustLevel === 'untrusted') {
      throw new Error('Untrusted profile packages cannot be installed');
    }

    if (
      isMarketDistributedPackage(manifest) &&
      trustLevel === 'community' &&
      !hasManifestSignature(manifest) &&
      !hasVerifiedPublisher(manifest)
    ) {
      throw new Error('Community profile packages require a signature or verified publisher');
    }

    if (
      metadata.data.hostRequirements?.length &&
      !metadata.data.hostRequirements.some((requirement) => requirement.host === 'vscode')
    ) {
      throw new Error('Profile package host requirements do not support VSCode');
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const publisherId =
      manifest.distribution?.publisher?.id ?? manifest.distribution?.publisherId ?? 'unknown';
    return path.join(this.profilesBaseDir, publisherId, manifest.name);
  }

  async onPostInstall(_manifest: AssetManifest, _installedPath: string): Promise<void> {
    await this.host?.refreshProfiles?.();
  }
}

function isMarketDistributedPackage(manifest: AssetManifest): boolean {
  return manifest.source.kind === 'registry' || manifest.source.kind === 'remote';
}

function hasManifestSignature(manifest: AssetManifest): boolean {
  return Boolean(
    manifest.typeMetadata?.type === 'profile'
      ? manifest.typeMetadata.data.signature ?? manifest.distribution?.signature
      : manifest.distribution?.signature,
  );
}

function hasVerifiedPublisher(manifest: AssetManifest): boolean {
  return manifest.distribution?.publisher?.verified === true || manifest.distribution?.verified === true;
}

function isPackageRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value) || value.includes('..')) {
    return false;
  }
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}
