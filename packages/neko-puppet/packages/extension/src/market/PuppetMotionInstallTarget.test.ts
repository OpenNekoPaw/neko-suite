import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest, MediaKind } from '@neko/shared';
import {
  PuppetConfigInstallTarget,
  PuppetModelInstallTarget,
  PuppetMotionInstallTarget,
} from './PuppetMediaInstallTarget';

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

describe('PuppetMediaInstallTarget', () => {
  it('routes puppet model, motion, and config media packages to separate preset roots', () => {
    const cases = [
      {
        kind: 'puppet-model',
        target: new PuppetModelInstallTarget('/tmp/puppet-model'),
        expected: '/tmp/puppet-model/studio/sakura',
      },
      {
        kind: 'puppet-motion',
        target: new PuppetMotionInstallTarget('/tmp/puppet-motion'),
        expected: '/tmp/puppet-motion/studio/sakura',
      },
      {
        kind: 'puppet-config',
        target: new PuppetConfigInstallTarget('/tmp/puppet-config'),
        expected: '/tmp/puppet-config/studio/sakura',
      },
    ] as const;

    for (const entry of cases) {
      const manifest = puppetMediaManifest(entry.kind);
      expect(() => entry.target.validateManifest(manifest)).not.toThrow();
      expect(entry.target.getInstallPath(manifest)).toBe(entry.expected);
    }
  });

  it('rejects mismatched puppet media kinds', () => {
    const target = new PuppetModelInstallTarget('/tmp/puppet-model');
    expect(() => target.validateManifest(puppetMediaManifest('puppet-config'))).toThrow(
      'cannot install media kind',
    );
  });
});

function puppetMotionManifest(): AssetManifest {
  return puppetMediaManifest('puppet-motion', 'walk-cycle');
}

function puppetMediaManifest(mediaKind: MediaKind, name = 'sakura'): AssetManifest {
  return {
    id: `@studio/${name}`,
    name,
    version: '1.0.0',
    type: 'media',
    source: { kind: 'local', path: `/tmp/${name}` },
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
        mediaKind,
        fileSize: 1,
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
