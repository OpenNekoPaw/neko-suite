import { describe, expect, it } from 'vitest';
import type { NkpProjectData } from '../puppet';

describe('nkp bundle contract', () => {
  it('preserves legacy puppet src compatibility', () => {
    const project: NkpProjectData = {
      version: '1',
      name: 'Legacy Moc3',
      puppet: {
        src: './model.moc3',
        format: 'moc3',
      },
      parameters: {},
      viewport: { zoom: 1 },
    };

    expect(project.puppet.src).toBe('./model.moc3');
    expect(project.puppet.bundle).toBeUndefined();
  });

  it('represents a bundle-memory Live2D source with lightweight bundle index', () => {
    const project: NkpProjectData = {
      version: '1',
      name: 'Bundle Backed',
      puppet: {
        src: null,
        format: 'moc3',
        bundle: {
          path: './sakura.zip',
          contentHash: 'sha256:abc',
          manifest: {
            bundlePath: './sakura.zip',
            entryPath: 'avatars/sakura/model3.json',
            fragmentRef: './sakura.zip#avatars/sakura/model3.json',
          },
          moc: {
            bundlePath: './sakura.zip',
            entryPath: 'avatars/sakura/model.moc3',
            fragmentRef: './sakura.zip#avatars/sakura/model.moc3',
          },
        },
      },
      bundleIndex: {
        storageMode: 'bundle-memory',
        manifest: {
          bundlePath: './sakura.zip',
          entryPath: 'avatars/sakura/model3.json',
          fragmentRef: './sakura.zip#avatars/sakura/model3.json',
        },
        moc: {
          bundlePath: './sakura.zip',
          entryPath: 'avatars/sakura/model.moc3',
          fragmentRef: './sakura.zip#avatars/sakura/model.moc3',
        },
        textures: [
          {
            index: 0,
            locator: {
              bundlePath: './sakura.zip',
              entryPath: 'avatars/sakura/textures/texture_00.png',
              fragmentRef: './sakura.zip#avatars/sakura/textures/texture_00.png',
            },
          },
        ],
        motions: [],
        expressions: [],
        parameterIds: ['ParamAngleX'],
      },
      parameters: {},
      viewport: { zoom: 1 },
    };

    expect(project.puppet.src).toBeNull();
    expect(project.bundleIndex?.textures[0]?.locator.entryPath).toBe(
      'avatars/sakura/textures/texture_00.png',
    );
  });
});
