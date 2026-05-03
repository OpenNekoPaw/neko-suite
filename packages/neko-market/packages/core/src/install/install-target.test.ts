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

const mockProviderCardTarget: IInstallTarget<'provider-card'> = {
  type: 'provider-card',
  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'provider-card') throw new Error('invalid provider-card manifest');
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

  it('should preserve optional target manifest validators', () => {
    const registry = new InstallTargetRegistry();
    registry.register(mockProviderCardTarget);

    const target = registry.get('provider-card');
    expect(target?.validateManifest).toBe(mockProviderCardTarget.validateManifest);
    expect(() =>
      target?.validateManifest?.({
        id: 'provider-card.sdxl',
        name: 'sdxl-card',
        version: '1.0.0',
        type: 'provider-card',
        source: { kind: 'remote', uri: 'https://example.invalid/sdxl-card.tgz' },
        createdAt: 1,
        updatedAt: 1,
      }),
    ).not.toThrow();
  });
});
