import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest } from '@neko/shared';
import { ProfilePackageInstallTarget } from './ProfilePackageInstallTarget';

describe('ProfilePackageInstallTarget', () => {
  it('rejects untrusted profile packages', () => {
    const target = new ProfilePackageInstallTarget('/profiles');

    expect(() => target.validateManifest(profileManifest({ trustLevel: 'untrusted' }))).toThrow(
      'Untrusted profile',
    );
  });

  it('requires signature or verified publisher for community market packages', () => {
    const target = new ProfilePackageInstallTarget('/profiles');

    expect(() =>
      target.validateManifest(
        profileManifest({
          trustLevel: 'community',
          verified: false,
          includeSignature: false,
        }),
      ),
    ).toThrow('Community profile packages require a signature or verified publisher');

    expect(() =>
      target.validateManifest(
        profileManifest({
          trustLevel: 'community',
          verified: true,
          includeSignature: false,
        }),
      ),
    ).not.toThrow();
  });

  it('allows local personal profile packages without registry signature', () => {
    const target = new ProfilePackageInstallTarget('/profiles');

    expect(() =>
      target.validateManifest(
        profileManifest({
          sourceKind: 'local',
          trustLevel: 'community',
          verified: false,
          includeSignature: false,
        }),
      ),
    ).not.toThrow();
  });

  it('rejects profile packages that cannot run in the VSCode host', () => {
    const target = new ProfilePackageInstallTarget('/profiles');

    expect(() =>
      target.validateManifest(
        profileManifest({
          hostRequirements: [{ host: 'tui' }],
        }),
      ),
    ).toThrow('host requirements do not support VSCode');
  });

  it('resolves install paths by publisher and not as runnable skills', async () => {
    const refreshProfiles = vi.fn();
    const target = new ProfilePackageInstallTarget('/profiles', { refreshProfiles });
    const manifest = profileManifest({ trustLevel: 'core' });

    expect(target.getInstallPath(manifest)).toBe('/profiles/studio/storyboard-profiles');

    await target.onPostInstall?.(manifest, '/profiles/studio/storyboard-profiles');

    expect(refreshProfiles).toHaveBeenCalledOnce();
  });
});

function profileManifest(
  options: {
    trustLevel?: 'core' | 'community' | 'untrusted';
    verified?: boolean;
    includeSignature?: boolean;
    sourceKind?: 'registry' | 'local';
    hostRequirements?: AssetManifestWithProfileMetadata['typeMetadata']['data']['hostRequirements'];
  } = {},
): AssetManifestWithProfileMetadata {
  const trustLevel = options.trustLevel ?? 'core';
  const includeSignature = options.includeSignature ?? true;
  return {
    id: '@studio/storyboard-profiles',
    name: 'storyboard-profiles',
    version: '1.0.0',
    type: 'profile',
    source:
      options.sourceKind === 'local'
        ? { kind: 'local', path: '/tmp/storyboard-profiles' }
        : {
            kind: 'registry',
            registry: 'https://market.neko.dev/api/v1',
            package: '@studio/storyboard-profiles',
            version: '1.0.0',
            integrity: 'sha256-test',
          },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['profile'],
      checksum: 'sha256-test',
      publisherId: 'studio',
      verified: options.verified ?? true,
    },
    typeMetadata: {
      type: 'profile',
      data: {
        profileKinds: ['artifact'],
        trustLevel,
        ...(includeSignature
          ? {
              signature: {
                algorithm: 'sha256',
                value: 'profile-signature',
              },
            }
          : {}),
        hostRequirements: options.hostRequirements ?? [{ host: 'vscode' }],
        profiles: [
          {
            profileId: 'studio.storyboard.v1',
            kind: 'artifact',
            version: 1,
            descriptorPath: 'profiles/storyboard.profile.json',
          },
        ],
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

type AssetManifestWithProfileMetadata = AssetManifest & {
  readonly type: 'profile';
  readonly typeMetadata: Extract<NonNullable<AssetManifest['typeMetadata']>, { type: 'profile' }>;
};
