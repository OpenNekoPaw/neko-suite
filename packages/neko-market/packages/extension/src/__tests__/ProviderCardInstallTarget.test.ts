import { describe, expect, it } from 'vitest';
import { ProviderCardInstallTarget } from '../ProviderCardInstallTarget';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';

function manifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    id: 'provider-card.sdxl',
    name: 'sdxl-card',
    version: '1.0.0',
    type: 'provider-card',
    source: { kind: 'remote', uri: 'https://example.invalid/sdxl-card.tgz' },
    distribution: {
      license: 'MIT',
      author: 'Neko',
      tags: ['provider-card'],
      checksum: 'sha256-test',
      publisherId: 'neko',
    },
    typeMetadata: {
      type: 'provider-card',
      data: {
        providerId: 'sdxl',
        capabilities: ['image.generate'],
        trustLevel: 'community',
        signature: { algorithm: 'sha256', value: 'sha256-test', signedBy: 'neko' },
      },
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('ProviderCardInstallTarget', () => {
  it('installs provider cards under the global provider-card directory', () => {
    const target = new ProviderCardInstallTarget();

    expect(target.type).toBe('provider-card');
    const providerCardManifest = manifest();
    expect(() => target.validateManifest(providerCardManifest)).not.toThrow();
    expect(target.getInstallPath(providerCardManifest)).toMatch(
      /\.neko\/providers\/neko\/sdxl-card$/,
    );
  });

  it('accepts core provider-card packages without marketplace signature metadata', () => {
    const target = new ProviderCardInstallTarget();

    expect(() =>
      target.validateManifest(
        manifest({
          distribution: {
            license: 'MIT',
            author: 'Neko',
            tags: ['provider-card'],
            checksum: 'sha256-test',
            publisherId: 'neko',
          },
          typeMetadata: {
            type: 'provider-card',
            data: {
              providerId: 'sdxl',
              capabilities: ['image.generate'],
              trustLevel: 'core',
            },
          },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts community provider-card packages from explicitly verified publishers', () => {
    const target = new ProviderCardInstallTarget();

    expect(() =>
      target.validateManifest(
        manifest({
          distribution: {
            license: 'MIT',
            author: 'Neko',
            tags: ['provider-card'],
            checksum: 'sha256-test',
            publisherId: 'neko',
            verified: true,
          },
          typeMetadata: {
            type: 'provider-card',
            data: {
              providerId: 'sdxl',
              capabilities: ['image.generate'],
              trustLevel: 'community',
            },
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects manifests with a mismatched asset type', () => {
    const target = new ProviderCardInstallTarget();

    expect(() =>
      target.validateManifest(
        manifest({
          type: 'skill',
        }),
      ),
    ).toThrow(/cannot install asset type/);
  });

  it('rejects untrusted provider-card packages', () => {
    const target = new ProviderCardInstallTarget();

    expect(() =>
      target.validateManifest(
        manifest({
          typeMetadata: {
            type: 'provider-card',
            data: {
              providerId: 'sdxl',
              capabilities: ['image.generate'],
              trustLevel: 'untrusted',
            },
          },
        }),
      ),
    ).toThrow(/Untrusted provider-card/);
  });

  it('requires community provider cards to be signed or published by a verified publisher', () => {
    const target = new ProviderCardInstallTarget();

    expect(() =>
      target.validateManifest(
        manifest({
          typeMetadata: {
            type: 'provider-card',
            data: {
              providerId: 'sdxl',
              capabilities: ['image.generate'],
              trustLevel: 'community',
            },
          },
        }),
      ),
    ).toThrow(/signature or verified publisher/);
  });
});
