import { describe, it, expect } from 'vitest';
import { InstallTargetRegistry } from './install-target';
import type { IInstallTarget } from '@neko/shared/types/asset/market';
import type { AssetManifest } from '@neko/shared/types/asset/manifest';

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
});
