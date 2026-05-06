import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest, AssetType, IInstallTarget } from '@neko/shared';
import { InstallTargetRegistry } from '@neko/market-core';
import { MediaInstallTarget, PresetInstallTarget } from '../BuiltinInstallTargets';
import { InstallTargetContributionRegistry } from '../install-target-contributions';

vi.mock('vscode', () => ({}));

describe('InstallTargetContributionRegistry', () => {
  it('registers X class builtin targets without domain package imports', () => {
    const targets = new InstallTargetRegistry();
    const contributions = new InstallTargetContributionRegistry(targets);

    contributions.registerBuiltin(new MediaInstallTarget('/tmp/media'));
    contributions.registerBuiltin(new PresetInstallTarget('/tmp/presets'));

    expect(targets.registeredTypes()).toEqual(['media', 'preset']);
    expect(contributions.getRegisteredTypes()).toEqual(['media', 'preset']);
  });

  it('rejects contributed overrides for builtin X class routes', () => {
    const contributions = new InstallTargetContributionRegistry(new InstallTargetRegistry());

    expect(() => contributions.registerInstallTarget(createTarget('media'))).toThrow(
      'Builtin install target',
    );
    expect(contributions.getDiagnostics().at(-1)).toMatchObject({
      level: 'error',
      type: 'media',
    });
  });

  it('registers and disposes a Y class live target', () => {
    const targets = new InstallTargetRegistry();
    const contributions = new InstallTargetContributionRegistry(targets);
    const disposable = contributions.registerInstallTarget(
      createTarget('skill'),
      'neko.neko-agent',
    );

    expect(targets.has('skill')).toBe(true);
    expect(contributions.getDiagnostics().at(-1)).toMatchObject({
      level: 'info',
      type: 'skill',
      extensionId: 'neko.neko-agent',
    });

    disposable.dispose();

    expect(targets.has('skill')).toBe(false);
  });

  it('selects kind-level declarations before type fallback when live target exists', () => {
    const contributions = new InstallTargetContributionRegistry(new InstallTargetRegistry());
    const shaderTarget = createTarget('shader');
    const shaderPresetTarget = createTarget('shader');
    contributions.registerInstallTarget(shaderTarget);
    contributions.registerInstallTarget(shaderPresetTarget, 'neko.neko-cut', 'preset');

    expect(contributions.resolveTarget(manifest('shader', 'standalone'))).toBe(shaderTarget);
    expect(contributions.resolveTarget(manifest('shader', 'preset'))).toBe(shaderPresetTarget);
  });

  it('discovers static declarations without activating extensions', () => {
    const contributions = new InstallTargetContributionRegistry(new InstallTargetRegistry());
    const extension = createExtension({
      id: 'neko.neko-agent',
      contributes: {
        'neko.installTargets': [{ type: 'skill', activationEvent: 'onInstallType:skill' }],
      },
    });

    contributions.discover([extension]);

    expect(extension.activate).not.toHaveBeenCalled();
  });

  it('lazily activates a contributor and waits for live registration', async () => {
    const coreTargets = new InstallTargetRegistry();
    const contributions = new InstallTargetContributionRegistry(coreTargets);
    const skillTarget = createTarget('skill');
    const extension = createExtension({
      id: 'neko.neko-agent',
      contributes: {
        'neko.installTargets': [{ type: 'skill', activationEvent: 'onInstallType:skill' }],
      },
      activate: async () => {
        contributions.registerInstallTarget(skillTarget, 'neko.neko-agent');
      },
    });
    contributions.discover([extension]);

    const target = await contributions.ensureTarget(skillManifest(), (id) =>
      id === extension.id ? extension : undefined,
    );

    expect(extension.activate).toHaveBeenCalledTimes(1);
    expect(target).toBe(skillTarget);
    expect(coreTargets.has('skill')).toBe(true);
  });

  it('allows Y-class routes only through contributed registration', () => {
    const targets = new InstallTargetRegistry();
    const contributions = new InstallTargetContributionRegistry(targets);

    contributions.registerBuiltin(new MediaInstallTarget('/tmp/media'));
    contributions.registerBuiltin(new PresetInstallTarget('/tmp/presets'));

    expect(contributions.getRegisteredTypes()).toEqual(['media', 'preset']);

    const model = createTarget('model');
    const shader = createTarget('shader');
    const provider = createTarget('provider');
    const disposables = [
      contributions.registerInstallTarget(model, 'neko.neko-agent'),
      contributions.registerInstallTarget(shader, 'neko.neko-cut'),
      contributions.registerInstallTarget(provider, 'neko.neko-agent'),
    ];

    expect(targets.has('model')).toBe(true);
    expect(targets.has('shader')).toBe(true);
    expect(targets.has('provider')).toBe(true);
    expect(contributions.resolveTarget(modelManifest())).toBe(model);
    expect(contributions.resolveTarget(shaderManifest())).toBe(shader);
    expect(contributions.resolveTarget(providerManifest())).toBe(provider);

    disposables.forEach((disposable) => disposable.dispose());
    expect(targets.has('model')).toBe(false);
    expect(targets.has('shader')).toBe(false);
    expect(targets.has('provider')).toBe(false);
  });

  it('allows kind-level contributed routes for builtin types without replacing the type route', () => {
    const targets = new InstallTargetRegistry();
    const contributions = new InstallTargetContributionRegistry(targets);
    const media = new MediaInstallTarget('/tmp/media');
    const puppetMotion = createTarget('media');

    contributions.registerBuiltin(media);
    const disposable = contributions.registerInstallTarget(
      puppetMotion,
      'neko.neko-puppet',
      'puppet-motion',
    );

    expect(contributions.resolveTarget(mediaManifest('image'))).toBe(media);
    expect(contributions.resolveTarget(mediaManifest('puppet-motion'))).toBe(puppetMotion);

    disposable.dispose();
    expect(contributions.resolveTarget(mediaManifest('puppet-motion'))).toBe(media);
  });

  it('surfaces activation and no-register contributor failures', async () => {
    const activationFailure = new InstallTargetContributionRegistry(new InstallTargetRegistry());
    const throwingExtension = createExtension({
      id: 'neko.bad-skill',
      contributes: {
        'neko.installTargets': [{ type: 'skill', activationEvent: 'onInstallType:skill' }],
      },
      activate: async () => {
        throw new Error('boom');
      },
    });
    activationFailure.discover([throwingExtension]);

    await expect(
      activationFailure.ensureTarget(skillManifest(), (id) =>
        id === throwingExtension.id ? throwingExtension : undefined,
      ),
    ).rejects.toThrow('activation failed');

    const noRegister = new InstallTargetContributionRegistry(new InstallTargetRegistry());
    const silentExtension = createExtension({
      id: 'neko.silent-skill',
      contributes: {
        'neko.installTargets': [{ type: 'skill', activationEvent: 'onInstallType:skill' }],
      },
    });
    noRegister.discover([silentExtension]);

    await expect(
      noRegister.ensureTarget(skillManifest(), (id) =>
        id === silentExtension.id ? silentExtension : undefined,
      ),
    ).rejects.toThrow('did not register');
  });
});

function createTarget(type: AssetType): IInstallTarget {
  return {
    type,
    getInstallPath: () => `/tmp/${type}`,
  };
}

function manifest(type: AssetManifest['type'], shaderKind: 'standalone' | 'preset'): AssetManifest {
  return {
    id: `@test/${type}`,
    name: type,
    version: '1.0.0',
    type,
    source: { kind: 'local', path: '/tmp/package' },
    distributionKind: 'archive',
    typeMetadata:
      type === 'shader'
        ? {
            type: 'shader',
            data: {
              shaderKind,
              language: 'wgsl',
              stage: 'fragment',
              inputs: [],
            },
          }
        : undefined,
    createdAt: 1,
    updatedAt: 1,
  };
}

function mediaManifest(mediaKind: 'image' | 'puppet-motion'): AssetManifest {
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

function skillManifest(): AssetManifest {
  return {
    id: '@test/skill',
    name: 'skill',
    version: '1.0.0',
    type: 'skill',
    source: { kind: 'local', path: '/tmp/package' },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'skill',
      data: { domain: ['video-edit'] },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function modelManifest(): AssetManifest {
  return {
    id: '@test/model',
    name: 'model',
    version: '1.0.0',
    type: 'model',
    source: { kind: 'local', path: '/tmp/package' },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'model',
      data: { modelKind: 'base', framework: 'onnx', task: 'upscale', size: 1 },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function shaderManifest(): AssetManifest {
  return {
    id: '@test/shader',
    name: 'shader',
    version: '1.0.0',
    type: 'shader',
    source: { kind: 'local', path: '/tmp/package' },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'shader',
      data: { shaderKind: 'standalone', language: 'wgsl', stage: 'fragment', inputs: [] },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function providerManifest(): AssetManifest {
  return {
    id: '@test/provider',
    name: 'provider',
    version: '1.0.0',
    type: 'provider',
    source: { kind: 'local', path: '/tmp/package' },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'provider',
      data: {
        providerId: 'test',
        capabilities: ['image.generate'],
        trustLevel: 'core',
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function createExtension(options: {
  id: string;
  contributes: Record<string, unknown>;
  activate?: () => Promise<void> | void;
}) {
  return {
    id: options.id,
    isActive: false,
    packageJSON: { contributes: options.contributes },
    activate: vi.fn(async () => {
      await options.activate?.();
    }),
  };
}
