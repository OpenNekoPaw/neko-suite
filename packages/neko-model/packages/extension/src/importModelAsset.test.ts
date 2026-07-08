import { describe, expect, it } from 'vitest';
import {
  createModelImportConflictPath,
  formatSupportedModelAssetExtensions,
  getSupportedModelAssetFileExtensions,
  parseModelImportAssetArgs,
  validateModelAssetPath,
} from './importModelAsset';

describe('model import asset contract', () => {
  it('classifies missing or malformed args before authoring execution', () => {
    expect(parseModelImportAssetArgs(undefined)).toEqual({ status: 'missing' });
    expect(parseModelImportAssetArgs({ path: '   ' })).toEqual({ status: 'missing' });
    expect(parseModelImportAssetArgs(['/tmp/character.glb'])).toEqual({ status: 'missing' });
  });

  it('parses supported model asset paths and trims optional names', () => {
    expect(
      parseModelImportAssetArgs({
        path: ' /tmp/character.GLB ',
        name: ' Hero ',
        documentUri: ' file:///workspace/hero.nkm ',
        reveal: false,
        target: { kind: 'file', documentUri: ' file:///workspace/target.nkm ', reveal: true },
      }),
    ).toEqual({
      status: 'valid',
      payload: {
        path: '/tmp/character.GLB',
        name: 'Hero',
        documentUri: 'file:///workspace/hero.nkm',
        reveal: false,
        target: { kind: 'file', documentUri: 'file:///workspace/target.nkm', reveal: true },
      },
    });
  });

  it('rejects unsupported model asset formats', () => {
    expect(parseModelImportAssetArgs({ path: '/tmp/preview.png' })).toEqual({
      status: 'invalid',
      reason: 'unsupportedFormat',
      path: '/tmp/preview.png',
      extension: '.png',
    });
  });

  it('validates glTF, GLB, and VRM extensions case-insensitively', () => {
    expect(validateModelAssetPath('/tmp/scene.gltf')).toEqual({
      supported: true,
      extension: '.gltf',
    });
    expect(validateModelAssetPath('/tmp/scene.GLB')).toEqual({
      supported: true,
      extension: '.glb',
    });
    expect(validateModelAssetPath('/tmp/avatar.VRM')).toEqual({
      supported: true,
      extension: '.vrm',
    });
    expect(validateModelAssetPath('/tmp/archive.zip')).toEqual({
      supported: false,
      extension: '.zip',
    });
  });

  it('exposes dialog filters and user-facing extension labels from one source', () => {
    expect(getSupportedModelAssetFileExtensions()).toEqual(['glb', 'gltf', 'vrm']);
    expect(formatSupportedModelAssetExtensions()).toBe('.glb, .gltf, .vrm');
  });

  it('builds timestamped conflict paths without iterative numeric probing', () => {
    expect(
      createModelImportConflictPath({
        targetPath: '/repo/.neko/imports/models/hero.glb',
        nonce: 1715000000000,
      }),
    ).toBe('/repo/.neko/imports/models/hero-1715000000000.glb');

    expect(
      createModelImportConflictPath({
        targetPath: '/repo/.neko/imports/models/hero.glb',
        nonce: 1715000000000,
        attempt: 1,
      }),
    ).toBe('/repo/.neko/imports/models/hero-1715000000000-1.glb');
  });
});
