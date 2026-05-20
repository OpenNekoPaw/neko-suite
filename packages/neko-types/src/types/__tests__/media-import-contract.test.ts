import { describe, expect, it } from 'vitest';
import type {
  ImportedAssetDescriptor,
  ImportPlan,
  ImportResult,
  ImportValidation,
} from '../media-import';

describe('media import contracts', () => {
  it('represents all supported import planning actions', () => {
    const plans: readonly ImportPlan[] = [
      {
        action: 'useSource',
        sourcePath: '/workspace/hero.glb',
        projectRef: './hero.glb',
      },
      {
        action: 'copy',
        sourcePath: '/external/hero.glb',
        targetPath: '/workspace/assets/hero.glb',
        targetDir: '/workspace/assets',
        projectRef: './assets/hero.glb',
      },
      {
        action: 'bundle-memory',
        sourcePath: '/external/sakura.zip',
        bundlePath: './imports/sakura.zip',
        projectRef: './imports/sakura.zip#avatars/sakura/model3.json',
      },
      {
        action: 'extract',
        sourcePath: '/external/model.zip',
        targetDir: '/workspace/.neko/imports/models/model',
        projectRef: './.neko/imports/models/model/scene.gltf',
      },
    ];

    expect(plans.map((plan) => plan.action)).toEqual([
      'useSource',
      'copy',
      'bundle-memory',
      'extract',
    ]);
  });

  it('describes imported workspace, disk, and bundle-memory assets', () => {
    const importedAssets: readonly ImportedAssetDescriptor[] = [
      {
        dimension: 'model',
        mediaKind: 'model-3d',
        storageMode: 'workspace',
        path: './hero.glb',
        sourceHash: 'sha256:model',
      },
      {
        dimension: 'motion',
        mediaKind: 'puppet-motion',
        storageMode: 'bundle-memory',
        locator: {
          bundlePath: './sakura.zip',
          entryPath: 'motions/wave.motion3.json',
          fragmentRef: './sakura.zip#motions/wave.motion3.json',
        },
      },
      {
        dimension: 'config',
        mediaKind: 'model-config',
        storageMode: 'disk',
        path: './hero.nkm',
        metadata: { format: 'nkm' },
      },
    ];
    const result: ImportResult = {
      projectFilePath: './hero.nkm',
      importedAssets,
      diagnostics: ['Imported with existing workspace references.'],
    };
    const validation: ImportValidation = {
      supported: true,
      detectedMediaKind: 'character-pack',
    };

    expect(result.importedAssets.map((asset) => asset.dimension)).toEqual([
      'model',
      'motion',
      'config',
    ]);
    expect(result.importedAssets[1]?.locator?.entryPath).toBe('motions/wave.motion3.json');
    expect(validation.detectedMediaKind).toBe('character-pack');
  });
});
