import { describe, it, expect } from 'vitest';
import { InstallTargetRegistry } from './install-target';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

const mockTarget: IInstallTarget<'skill'> = {
  type: 'skill',
  getInstallPath(manifest: AssetManifest): string {
    return `/home/user/.neko/skills/${manifest.name}`;
  },
};

const mockShaderTarget: IInstallTarget<'shader'> = {
  type: 'shader',
  getInstallPath(manifest: AssetManifest): string {
    return `/home/user/.neko/shaders/${manifest.name}`;
  },
};

const mockProviderTarget: IInstallTarget<'provider'> = {
  type: 'provider',
  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'provider') throw new Error('invalid provider manifest');
  },
  getInstallPath(manifest: AssetManifest): string {
    return `/home/user/.neko/providers/${manifest.name}`;
  },
};

describe('InstallTargetRegistry', () => {
  it('should register and retrieve targets', () => {
    const registry = new InstallTargetRegistry();
    registry.register(mockTarget);

    expect(registry.get('skill')).toBe(mockTarget);
    expect(registry.has('skill')).toBe(true);
  });

  it('should return undefined for unregistered types', () => {
    const registry = new InstallTargetRegistry();
    expect(registry.get('shader')).toBeUndefined();
    expect(registry.has('shader')).toBe(false);
  });

  it('should list registered types', () => {
    const registry = new InstallTargetRegistry();
    registry.register(mockTarget);
    registry.register(mockShaderTarget);

    const types = registry.registeredTypes();
    expect(types).toContain('skill');
    expect(types).toContain('shader');
    expect(types).toHaveLength(2);
  });

  it('should prefer kind route when resolving a manifest', () => {
    const registry = new InstallTargetRegistry();
    const genericShaderTarget: IInstallTarget<'shader'> = {
      type: 'shader',
      getInstallPath: () => '/generic',
    };
    const presetShaderTarget: IInstallTarget<'shader'> = {
      type: 'shader',
      getInstallPath: () => '/preset',
    };
    registry.register(genericShaderTarget);
    registry.register(presetShaderTarget, 'preset');

    const target = registry.getForManifest({
      id: '@test/shader',
      name: 'shader',
      version: '1.0.0',
      type: 'shader',
      source: { kind: 'local', path: '/tmp/shader' },
      distributionKind: 'archive',
      typeMetadata: {
        type: 'shader',
        data: {
          shaderKind: 'preset',
          language: 'wgsl',
          stage: 'fragment',
          inputs: [],
        },
      },
      createdAt: 1,
      updatedAt: 1,
    });

    expect(target).toBe(presetShaderTarget);
    expect(registry.registeredTypes()).toEqual(['shader']);
  });

  it('should route character asset media kinds through kind-level targets', () => {
    const registry = new InstallTargetRegistry();
    const genericMediaTarget: IInstallTarget<'media'> = {
      type: 'media',
      getInstallPath: () => '/media/generic',
    };
    const puppetTarget: IInstallTarget<'media'> = {
      type: 'media',
      getInstallPath: () => '/media/puppet-model',
    };
    const modelTarget: IInstallTarget<'media'> = {
      type: 'media',
      getInstallPath: () => '/media/model-3d',
    };
    const voiceTarget: IInstallTarget<'media'> = {
      type: 'media',
      getInstallPath: () => '/media/voice-pack',
    };

    registry.register(genericMediaTarget);
    registry.register(puppetTarget, 'puppet-model');
    registry.register(modelTarget, 'model-3d');
    registry.register(voiceTarget, 'voice-pack');

    expect(registry.getForManifest(mediaManifest('puppet-model'))).toBe(puppetTarget);
    expect(registry.getForManifest(mediaManifest('model-3d'))).toBe(modelTarget);
    expect(registry.getForManifest(mediaManifest('voice-pack'))).toBe(voiceTarget);
    expect(registry.getForManifest(mediaManifest('image'))).toBe(genericMediaTarget);
  });

  it('should preserve optional target manifest validators', () => {
    const registry = new InstallTargetRegistry();
    registry.register(mockProviderTarget);

    const target = registry.get('provider');
    expect(target?.validateManifest).toBe(mockProviderTarget.validateManifest);
    expect(() =>
      target?.validateManifest?.({
        id: '@test/sdxl-provider',
        name: 'sdxl-card',
        version: '1.0.0',
        type: 'provider',
        source: { kind: 'remote', uri: 'https://example.invalid/sdxl-card.tgz' },
        distributionKind: 'archive',
        createdAt: 1,
        updatedAt: 1,
      }),
    ).not.toThrow();
  });
});

function mediaManifest(
  mediaKind: 'image' | 'puppet-model' | 'model-3d' | 'voice-pack',
): AssetManifest {
  return {
    id: `@test/${mediaKind}`,
    name: mediaKind,
    version: '1.0.0',
    type: 'media',
    source: { kind: 'local', path: '/tmp/package' },
    distributionKind: 'archive',
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
