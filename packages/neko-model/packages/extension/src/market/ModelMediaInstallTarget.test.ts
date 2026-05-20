import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest, MediaKind } from '@neko/shared';
import {
  ModelAssetInstallTarget,
  ModelConfigInstallTarget,
  ModelMotionInstallTarget,
} from './ModelMediaInstallTarget';

describe('ModelMediaInstallTarget', () => {
  it('routes model media packages to separate model roots', () => {
    const cases = [
      {
        kind: 'model-3d',
        target: new ModelAssetInstallTarget('/tmp/models/3d'),
        expected: '/tmp/models/3d/studio/sakura',
      },
      {
        kind: 'model-motion',
        target: new ModelMotionInstallTarget('/tmp/models/3d-motion'),
        expected: '/tmp/models/3d-motion/studio/sakura',
      },
      {
        kind: 'model-config',
        target: new ModelConfigInstallTarget('/tmp/models/3d-config'),
        expected: '/tmp/models/3d-config/studio/sakura',
      },
    ] as const;

    for (const entry of cases) {
      const manifest = modelMediaManifest(entry.kind);
      expect(() => entry.target.validateManifest(manifest)).not.toThrow();
      expect(entry.target.getInstallPath(manifest)).toBe(entry.expected);
    }
  });

  it('runs optional post-install reload hook', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const target = new ModelAssetInstallTarget('/tmp/models/3d', reload);
    const manifest = modelMediaManifest('model-3d');

    await target.onPostInstall?.(manifest, '/tmp/models/3d/studio/sakura');

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched model media kinds', () => {
    const target = new ModelAssetInstallTarget('/tmp/models/3d');
    expect(() => target.validateManifest(modelMediaManifest('model-motion'))).toThrow(
      'cannot install media kind',
    );
  });
});

function modelMediaManifest(mediaKind: MediaKind): AssetManifest {
  return {
    id: '@studio/sakura',
    name: 'sakura',
    version: '1.0.0',
    type: 'media',
    source: { kind: 'local', path: '/tmp/sakura' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['model'],
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
