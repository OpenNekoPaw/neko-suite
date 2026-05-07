import { describe, expect, it } from 'vitest';
import {
  createModelImportConflictPath,
  createModelProjectImportPlan,
  formatModelProjectSrc,
  formatSupportedModelAssetExtensions,
  getSupportedModelAssetFileExtensions,
  parseModelImportAssetArgs,
  validateModelAssetPath,
} from './importModelAsset';

describe('model import asset contract', () => {
  it('treats missing or malformed args as interactive import', () => {
    expect(parseModelImportAssetArgs(undefined)).toEqual({ status: 'missing' });
    expect(parseModelImportAssetArgs({ path: '   ' })).toEqual({ status: 'missing' });
    expect(parseModelImportAssetArgs(['/tmp/character.glb'])).toEqual({ status: 'missing' });
  });

  it('parses supported model asset paths and trims optional names', () => {
    expect(parseModelImportAssetArgs({ path: ' /tmp/character.GLB ', name: ' Hero ' })).toEqual({
      status: 'valid',
      payload: {
        path: '/tmp/character.GLB',
        name: 'Hero',
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

  it('keeps workspace-local model imports on their source path', () => {
    expect(
      createModelProjectImportPlan({
        sourcePath: '/repo/assets/hero.glb',
        documentPath: '/repo/scenes/shot.nkm',
        workspaceFolderPaths: ['/repo'],
      }),
    ).toEqual({
      action: 'useSource',
      sourcePath: '/repo/assets/hero.glb',
      importPath: '/repo/assets/hero.glb',
      projectModelSrc: '../assets/hero.glb',
    });
  });

  it('materializes external model imports into the owning workspace .neko directory', () => {
    expect(
      createModelProjectImportPlan({
        sourcePath: '/tmp/neko-agent/hero.glb',
        documentPath: '/repo/scenes/shot.nkm',
        workspaceFolderPaths: ['/repo'],
      }),
    ).toEqual({
      action: 'copy',
      sourcePath: '/tmp/neko-agent/hero.glb',
      importPath: '/repo/.neko/imports/models/hero.glb',
      importDirectory: '/repo/.neko/imports/models',
      projectModelSrc: '../.neko/imports/models/hero.glb',
    });
  });

  it('materializes external model imports next to standalone projects without a workspace', () => {
    expect(
      createModelProjectImportPlan({
        sourcePath: '/tmp/neko-agent/hero.glb',
        documentPath: '/projects/model/shot.nkm',
      }),
    ).toEqual({
      action: 'copy',
      sourcePath: '/tmp/neko-agent/hero.glb',
      importPath: '/projects/model/.neko/imports/models/hero.glb',
      importDirectory: '/projects/model/.neko/imports/models',
      projectModelSrc: './.neko/imports/models/hero.glb',
    });
  });

  it('formats model project src values as normalized relative references', () => {
    expect(formatModelProjectSrc('asset.glb')).toBe('./asset.glb');
    expect(formatModelProjectSrc('./asset.glb')).toBe('./asset.glb');
    expect(formatModelProjectSrc('../asset.glb')).toBe('../asset.glb');
    expect(formatModelProjectSrc('nested\\asset.glb')).toBe('./nested/asset.glb');
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
