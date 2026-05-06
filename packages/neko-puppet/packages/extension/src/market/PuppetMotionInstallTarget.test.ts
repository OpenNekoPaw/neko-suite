import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest } from '@neko/shared';
import { PuppetMotionInstallTarget } from './PuppetMotionInstallTarget';

describe('PuppetMotionInstallTarget', () => {
  it('routes only puppet-motion media packages and reloads presets', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const target = new PuppetMotionInstallTarget('/tmp/puppet-motion', reload);
    const manifest = puppetMotionManifest();

    expect(() => target.validateManifest(manifest)).not.toThrow();
    expect(target.getInstallPath(manifest)).toBe('/tmp/puppet-motion/studio/walk-cycle');

    await target.onPostInstall?.(manifest, '/tmp/puppet-motion/studio/walk-cycle');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

function puppetMotionManifest(): AssetManifest {
  return {
    id: '@studio/walk-cycle',
    name: 'walk-cycle',
    version: '1.0.0',
    type: 'media',
    source: { kind: 'local', path: '/tmp/walk-cycle' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['puppet'],
      checksum: 'sha256-test',
      publisherId: 'studio',
    },
    typeMetadata: {
      type: 'media',
      data: {
        mediaKind: 'puppet-motion',
        fileSize: 1,
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
