import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@neko/shared';
import { ProviderCardInstallTarget } from './ProviderCardInstallTarget';

describe('ProviderCardInstallTarget', () => {
  it('rejects untrusted provider packages', () => {
    const target = new ProviderCardInstallTarget();

    expect(() => target.validateManifest(providerManifest('untrusted'))).toThrow(
      'Untrusted provider',
    );
  });

  it('allows trusted provider packages', () => {
    const target = new ProviderCardInstallTarget();

    expect(() => target.validateManifest(providerManifest('core'))).not.toThrow();
    expect(target.getInstallPath(providerManifest('core'))).toContain(
      '/.neko/providers/studio/provider',
    );
  });
});

function providerManifest(trustLevel: 'core' | 'community' | 'untrusted'): AssetManifest {
  return {
    id: '@studio/provider',
    name: 'provider',
    version: '1.0.0',
    type: 'provider',
    source: { kind: 'local', path: '/tmp/provider' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['provider'],
      checksum: 'sha256-test',
      publisherId: 'studio',
      verified: trustLevel === 'community',
    },
    typeMetadata: {
      type: 'provider',
      data: {
        providerId: 'studio',
        capabilities: ['image.generate'],
        trustLevel,
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
