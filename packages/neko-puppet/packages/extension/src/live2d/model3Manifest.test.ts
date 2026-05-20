import { describe, expect, it } from 'vitest';
import { parseLive2dModel3Manifest } from './model3Manifest';
import {
  archiveEntries,
  nestedLive2dBundleEntries,
  nestedLive2dModel3Json,
} from './__fixtures__/live2dBundleFixtures';

describe('parseLive2dModel3Manifest', () => {
  it('resolves nested model3.json references into bundle locators and bundle index entries', () => {
    const result = parseLive2dModel3Manifest({
      bundlePath: './sakura.zip',
      manifestEntryPath: 'avatars/sakura/model3.json',
      model3Json: nestedLive2dModel3Json,
      archiveEntries: archiveEntries(nestedLive2dBundleEntries),
      contentHash: 'sha256:abc',
      generatedAt: '2026-05-20T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.manifest.bundle.path).toBe('./sakura.zip');
    expect(result.manifest.bundle.moc.entryPath).toBe('avatars/sakura/model/sakura.moc3');
    expect(
      result.manifest.bundleIndex.textures.map((texture) => texture.locator.entryPath),
    ).toEqual(['avatars/sakura/textures/texture_00.png', 'avatars/sakura/textures/texture_01.png']);
    expect(result.manifest.bundleIndex.motions[0]).toMatchObject({
      name: 'Idle-1',
      group: 'Idle',
      fadeInTime: 0.5,
      fadeOutTime: 1,
    });
    expect(result.manifest.bundleIndex.motions[1]).toMatchObject({
      name: 'tap-body',
      group: 'TapBody',
    });
    expect(result.manifest.bundleIndex.expressions[0]?.name).toBe('smile');
    expect(result.manifest.bundleIndex.physics?.entryPath).toBe(
      'avatars/shared/sakura.physics3.json',
    );
    expect(result.manifest.bundleIndex.parameterIds).toEqual(['ParamEyeLOpen', 'ParamEyeROpen']);
    expect(result.manifest.referencedEntryPaths).toEqual([
      'avatars/sakura/model3.json',
      'avatars/sakura/model/sakura.moc3',
      'avatars/sakura/textures/texture_00.png',
      'avatars/sakura/textures/texture_01.png',
      'avatars/sakura/motions/idle.motion3.json',
      'avatars/shared/motions/tap.motion3.json',
      'avatars/sakura/expressions/smile.exp3.json',
      'avatars/shared/sakura.physics3.json',
    ]);
  });

  it('reports missing referenced entries', () => {
    const result = parseLive2dModel3Manifest({
      bundlePath: './sakura.zip',
      manifestEntryPath: 'model3.json',
      model3Json: {
        FileReferences: {
          Moc: 'sakura.moc3',
          Textures: ['textures/missing.png'],
        },
      },
      archiveEntries: archiveEntries(['model3.json', 'sakura.moc3']),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-entry',
          entryPath: 'textures/missing.png',
        }),
      ]),
    );
  });

  it('rejects unsafe manifest references before reading referenced entries', () => {
    const result = parseLive2dModel3Manifest({
      bundlePath: './sakura.zip',
      manifestEntryPath: 'model3.json',
      model3Json: {
        FileReferences: {
          Moc: '../escape.moc3',
        },
      },
      archiveEntries: archiveEntries(['model3.json']),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({
      code: 'invalid-reference',
      pathIssue: 'parent-segment',
    });
  });

  it('rejects duplicate ZIP entries after normalized path validation', () => {
    const result = parseLive2dModel3Manifest({
      bundlePath: './sakura.zip',
      manifestEntryPath: 'model3.json',
      model3Json: {
        FileReferences: {
          Moc: 'sakura.moc3',
        },
      },
      archiveEntries: archiveEntries(['model3.json', 'textures/a.png', 'textures\\a.png']),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-archive',
          entryPath: 'textures\\a.png',
        }),
      ]),
    );
  });
});
