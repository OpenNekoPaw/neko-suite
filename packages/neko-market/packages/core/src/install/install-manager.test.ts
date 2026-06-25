import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AssetManifest,
  AssetType,
  DownloadDescriptor,
  EntitlementCheck,
  ICacheManager,
  IInstallTarget,
  ILicenseManager,
  IMarketClient,
  IVersionResolver,
  InstallPhase,
  InstalledPackage,
} from '@neko/shared';
import { InstallManager } from './install-manager';
import { InstallTargetRegistry } from './install-target';
import { InstalledRegistry } from '../registry/installed-registry';
import { EffectsActivator, EffectsInverter } from './effects-inverter';

const tempDirs: string[] = [];
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
  mockFetch.mockReset();
});

describe('InstallManager lifecycle', () => {
  it('emits v4 phases and records active package after archive install', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const phases: InstallPhase[] = [];
    const target = createTarget();
    const manager = createManager({
      archive,
      installed,
      target,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0', (progress) => {
      if (progress.percent === 100) phases.push(progress.phase);
    });

    expect(result.success).toBe(true);
    expect(phases).toEqual(
      expect.arrayContaining([
        'discover',
        'resolve',
        'preflight',
        'fetch',
        'verify',
        'stage',
        'activate',
        'record',
        'done',
      ]),
    );
    expect(installed.get('@test/skill')?.status).toBe('active');
    expect(target.onPreInstall).toHaveBeenCalledTimes(1);
    expect(target.onPostInstall).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed server manifest during discover validation', async () => {
    const installed = await createInstalledRegistry();
    const manager = createManager({
      installed,
      manifest: { ...createManifest(), distributionKind: 'unknown' } as unknown as AssetManifest,
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid AssetManifest');
    expect(installed.list()).toEqual([]);
  });

  it('rejects descriptor integrity mismatch before staging', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const target = createTarget();
    const manager = createManager({
      archive,
      installed,
      target,
      descriptor: createDescriptor({ integrity: 'sha256-other' }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Download descriptor integrity');
    expect(target.onPostInstall).not.toHaveBeenCalled();
    expect(installed.list()).toEqual([]);
  });

  it('rejects local dependency self cycle during resolve', async () => {
    const archive = await createPayloadDir();
    const target = createTarget();
    const manager = createManager({
      archive,
      target,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
        dependencies: [{ id: '@test/skill', version: '^1.0.0' }],
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Dependency cycle');
    expect(target.onPreInstall).not.toHaveBeenCalled();
  });

  it('rejects registry manifests without signature metadata', async () => {
    const archive = await createPayloadDir();
    const target = createTarget();
    const manager = createManager({
      archive,
      target,
      manifest: createManifest({
        distribution: {
          license: 'MIT',
          author: 'test',
          tags: ['skill'],
          checksum: 'sha256-test',
        },
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('distribution.signature');
    expect(target.onPreInstall).not.toHaveBeenCalled();
  });

  it('blocks expired entitlement before fetch', async () => {
    const archive = await createPayloadDir();
    const target = createTarget();
    const manager = createManager({
      archive,
      target,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
      }),
      licenseResult: { allowed: true, expiresAt: Date.now() - 1 },
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(target.onPreInstall).not.toHaveBeenCalled();
  });

  it('blocks server entitlement denied before fetch', async () => {
    const archive = await createPayloadDir();
    const target = createTarget();
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      archive,
      target,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
      }),
      entitlementResult: { allowed: false, reason: 'not-purchased' },
      getDownloadDescriptor,
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not-purchased');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
    expect(target.onPreInstall).not.toHaveBeenCalled();
  });

  it('blocks activation when an installed package record is expired', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    await installed.add(createInstalledPackage({ status: 'expired' }));
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      archive,
      installed,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
      }),
      getDownloadDescriptor,
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
  });

  it('calls rollback hook on activation failure', async () => {
    const archive = await createPayloadDir();
    const target = createTarget({
      onPostInstall: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('activate failed')),
    });
    const manager = createManager({ archive, target });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(target.onRollback).toHaveBeenCalledTimes(1);
  });

  it('records deprecated status from manifest deprecation metadata', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const manager = createManager({
      archive,
      installed,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
        deprecation: { since: 123, replacedBy: '@test/new-skill' },
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(true);
    expect(installed.get('@test/skill')?.status).toBe('deprecated');
  });

  it('inverts declared effects before uninstall file cleanup', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const installPath = await mkdtemp(join(tmpdir(), 'neko-market-effects-target-'));
    tempDirs.push(installPath);
    await mkdir(join(installPath, 'generated'), { recursive: true });
    await writeFile(join(installPath, 'generated', 'registry.json'), '{}', 'utf-8');
    const registerProvider = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const unregisterProvider = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const manager = createManager({
      archive,
      installed,
      target: createTarget({
        getInstallPath: vi.fn(() => installPath),
      }),
      manifest: createManifest({
        source: { kind: 'local', path: archive },
        effects: {
          files: {
            writes: ['generated/registry.json'],
          },
          registrations: {
            providers: ['provider.test'],
          },
        },
      }),
      effectsActivator: new EffectsActivator({ registerProvider }),
      effectsInverter: new EffectsInverter({ unregisterProvider }),
    });

    const result = await manager.install('@test/skill', '1.0.0');
    expect(result.success).toBe(true);
    expect(registerProvider).toHaveBeenCalledWith('provider.test');

    await manager.uninstall('@test/skill');

    expect(unregisterProvider).toHaveBeenCalledWith('provider.test');
    await expect(stat(join(installPath, 'generated', 'registry.json'))).rejects.toThrow();
    expect(installed.has('@test/skill')).toBe(false);
  });

  it('rolls back activated effects and staged files when activation fails', async () => {
    const archive = await createPayloadDir();
    const installPath = await mkdtemp(join(tmpdir(), 'neko-market-rollback-target-'));
    tempDirs.push(installPath);
    const unregisterCommand = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const target = createTarget({
      getInstallPath: vi.fn(() => installPath),
      onPostInstall: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('activate failed')),
    });
    const manager = createManager({
      archive,
      target,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
        effects: {
          registrations: {
            commands: ['neko.test.command'],
          },
        },
      }),
      effectsInverter: new EffectsInverter({ unregisterCommand }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(unregisterCommand).toHaveBeenCalledWith('neko.test.command');
    await expect(access(installPath)).rejects.toThrow();
  });

  it('writes registration distribution through target stage hook without archive download', async () => {
    const installed = await createInstalledRegistry();
    const writeRegistration = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const onPostInstall = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const target = createTarget({
      type: 'endpoint',
      getInstallPath: vi.fn(() => join(tmpdir(), `neko-market-endpoint-${Math.random()}`)),
      writeRegistration,
      onPostInstall,
    });
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      installed,
      target,
      manifest: createManifest({
        type: 'endpoint',
        distributionKind: 'registration',
        typeMetadata: {
          type: 'endpoint',
          data: {
            provider: 'openai',
            capabilities: ['chat'],
            endpointTemplate: 'https://api.example.invalid/${model}',
            credentialSchema: { fields: [] },
          },
        },
      }),
      getDownloadDescriptor,
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(true);
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
    expect(writeRegistration).toHaveBeenCalledTimes(1);
    expect(onPostInstall).toHaveBeenCalledTimes(1);
    expect(installed.get('@test/skill')?.type).toBe('endpoint');
  });

  it('rejects registration distribution when target has no writeRegistration hook', async () => {
    const installed = await createInstalledRegistry();
    const target = createTarget({
      type: 'endpoint',
      getInstallPath: vi.fn(() => join(tmpdir(), `neko-market-endpoint-${Math.random()}`)),
    });
    const manager = createManager({
      installed,
      target,
      manifest: createManifest({
        type: 'endpoint',
        distributionKind: 'registration',
        typeMetadata: {
          type: 'endpoint',
          data: {
            provider: 'openai',
            capabilities: ['chat'],
            endpointTemplate: 'https://api.example.invalid/${model}',
            credentialSchema: { fields: [] },
          },
        },
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('writeRegistration');
    expect(installed.list()).toEqual([]);
  });

  it('skips archive download for orchestration distribution', async () => {
    const installed = await createInstalledRegistry();
    const content = createInstalledPackage({
      packageId: '@test/content',
      version: '1.0.0',
      type: 'media',
      manifest: createMediaManifest({ id: '@test/content', name: 'content' }),
    });
    await installed.add(content);
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      installed,
      manifest: createManifest({
        type: 'bundle',
        distributionKind: 'orchestration',
        typeMetadata: {
          type: 'bundle',
          data: { installPolicy: 'all' },
        },
        contents: [{ packageId: '@test/content', version: '^1.0.0' }],
      }),
      target: createTarget({
        type: 'bundle',
        getInstallPath: vi.fn(() => join(tmpdir(), `neko-market-bundle-${Math.random()}`)),
      }),
      getDownloadDescriptor,
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(true);
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
    expect(installed.get('@test/skill')?.type).toBe('bundle');
    expect(installed.getReference('@test/content')?.owners).toEqual(['@test/skill']);
  });

  it('decrements bundle references and removes bundle-owned content on uninstall', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const contentManifest = createMediaManifest({
      id: '@test/content',
      name: 'content',
      source: { kind: 'local', path: archive },
    });
    const manager = createManager({
      archive,
      installed,
      manifest: createManifest({
        type: 'bundle',
        distributionKind: 'orchestration',
        typeMetadata: {
          type: 'bundle',
          data: { installPolicy: 'all' },
        },
        contents: [{ packageId: '@test/content', version: '^1.0.0' }],
      }),
      packages: { '@test/content': contentManifest },
      target: createTarget({
        type: 'bundle',
        getInstallPath: vi.fn(() => join(tmpdir(), `neko-market-bundle-${Math.random()}`)),
      }),
      targets: [
        createTarget({
          type: 'media',
          getInstallPath: vi.fn(() => join(tmpdir(), `neko-market-media-${Math.random()}`)),
        }),
      ],
    });

    const result = await manager.install('@test/skill', '1.0.0');
    expect(result.success).toBe(true);
    expect(installed.getReference('@test/content')?.refCount).toBe(1);
    expect(installed.get('@test/content')?.requested).toBe(false);

    await manager.uninstall('@test/skill');

    expect(installed.getReference('@test/content')).toBeUndefined();
    expect(installed.has('@test/content')).toBe(false);
  });

  it('keeps shared content while another bundle reference remains', async () => {
    const installed = await createInstalledRegistry();
    await installed.add(
      createInstalledPackage({
        packageId: '@test/content',
        manifest: createMediaManifest({ id: '@test/content', name: 'content' }),
        requested: false,
      }),
    );
    await installed.addReference('@test/content', '@test/bundle-a');
    await installed.addReference('@test/content', '@test/bundle-b');
    await installed.add(
      createInstalledPackage({
        packageId: '@test/bundle-a',
        type: 'bundle',
        manifest: createBundleManifest('@test/bundle-a', ['@test/content']),
        requested: true,
      }),
    );
    await installed.add(
      createInstalledPackage({
        packageId: '@test/bundle-b',
        type: 'bundle',
        manifest: createBundleManifest('@test/bundle-b', ['@test/content']),
        requested: true,
      }),
    );
    const manager = createManager({
      installed,
      manifest: createBundleManifest('@test/bundle-a', ['@test/content']),
      target: createTarget({ type: 'bundle' }),
    });

    await manager.uninstall('@test/bundle-a');

    expect(installed.has('@test/content')).toBe(true);
    expect(installed.getReference('@test/content')).toEqual({
      refCount: 1,
      owners: ['@test/bundle-b'],
    });
  });

  it('keeps directly requested content after final bundle uninstall', async () => {
    const installed = await createInstalledRegistry();
    await installed.add(
      createInstalledPackage({
        packageId: '@test/content',
        manifest: createMediaManifest({ id: '@test/content', name: 'content' }),
        requested: true,
      }),
    );
    await installed.addReference('@test/content', '@test/bundle-a');
    await installed.add(
      createInstalledPackage({
        packageId: '@test/bundle-a',
        type: 'bundle',
        manifest: createBundleManifest('@test/bundle-a', ['@test/content']),
        requested: true,
      }),
    );
    const manager = createManager({
      installed,
      manifest: createBundleManifest('@test/bundle-a', ['@test/content']),
      target: createTarget({ type: 'bundle' }),
    });

    await manager.uninstall('@test/bundle-a');

    expect(installed.has('@test/content')).toBe(true);
    expect(installed.get('@test/content')?.requested).toBe(true);
    expect(installed.getReference('@test/content')).toBeUndefined();
  });

  it('skips optional dependency when no satisfying version is available', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const target = createTarget();
    const manager = createManager({
      archive,
      installed,
      target,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
        dependencies: [{ id: '@test/missing-optional', version: '^1.0.0', optional: true }],
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(true);
    expect(installed.has('@test/missing-optional')).toBe(false);
    expect(target.onPostInstall).toHaveBeenCalledTimes(1);
  });

  it('blocks declared conflicts during preflight before fetch', async () => {
    const installed = await createInstalledRegistry();
    await installed.add(createInstalledPackage({ packageId: '@test/conflict' }));
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      installed,
      manifest: createManifest({
        effects: { conflicts: ['@test/conflict'] },
      }),
      getDownloadDescriptor,
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('conflicts');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
  });

  it('blocks untrusted tooling package during preflight', async () => {
    const manager = createManager({
      manifest: createManifest({
        distribution: {
          license: 'MIT',
          author: 'test',
          tags: ['skill'],
          checksum: 'sha256-test',
          trustLevel: 'untrusted',
          signature: { algorithm: 'sha256', value: 'manifest' },
        },
      }),
    });

    const result = await manager.install('@test/skill', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Untrusted package');
  });

  it('blocks unverified native plugins before download or staging', async () => {
    const getDownloadDescriptor = vi.fn();
    const target = createTarget({ type: 'plugin' });
    const manager = createManager({
      target,
      manifest: createPluginManifest({
        distribution: createPluginDistribution({
          publisher: {
            id: 'community-publisher',
            displayName: 'Community Publisher',
            verified: false,
          },
        }),
      }),
      getDownloadDescriptor,
    });

    const result = await manager.install('@test/plugin', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('verified publisher');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
    expect(target.onPreInstall).not.toHaveBeenCalled();
  });

  it('rejects incompatible plugin target triples before download', async () => {
    const getDownloadDescriptor = vi.fn();
    const target = createTarget({ type: 'plugin' });
    const manager = createManager({
      target,
      manifest: createPluginManifest(),
      getDownloadDescriptor,
      config: { currentTargetTriple: 'x86_64-unknown-linux-gnu' },
    });

    const result = await manager.install('@test/plugin', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('incompatible');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
    expect(target.onPreInstall).not.toHaveBeenCalled();
  });

  it('blocks verified third-party plugins in limited workspaces', async () => {
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      target: createTarget({ type: 'plugin' }),
      manifest: createPluginManifest(),
      getDownloadDescriptor,
      config: { workspaceTrustLevel: 'limited' },
    });

    const result = await manager.install('@test/plugin', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Limited workspace');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
  });

  it('requires active Developer Mode for local native plugins', async () => {
    const archive = await createPayloadDir();
    const getDownloadDescriptor = vi.fn();
    const manager = createManager({
      archive,
      target: createTarget({ type: 'plugin' }),
      manifest: createLocalPluginManifest(),
      getDownloadDescriptor,
      config: { workspaceTrustLevel: 'trusted' },
    });

    const result = await manager.install('@test/plugin', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Developer Mode');
    expect(getDownloadDescriptor).not.toHaveBeenCalled();
  });

  it('blocks local native plugins in restricted workspaces despite Developer Mode', async () => {
    const archive = await createPayloadDir();
    const manager = createManager({
      archive,
      target: createTarget({ type: 'plugin' }),
      manifest: createLocalPluginManifest(),
      config: {
        workspaceTrustLevel: 'restricted',
        developerMode: { active: true, expiresAt: Date.now() + 60_000 },
      },
    });

    const result = await manager.install('@test/plugin', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('trusted workspace');
  });

  it('rejects expired Developer Mode for local native plugins', async () => {
    const archive = await createPayloadDir();
    const manager = createManager({
      archive,
      target: createTarget({ type: 'plugin' }),
      manifest: createLocalPluginManifest(),
      config: {
        workspaceTrustLevel: 'trusted',
        developerMode: { active: true, expiresAt: Date.now() - 1 },
      },
    });

    const result = await manager.install('@test/plugin', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('rejects bundle contents that resolve to sideload assets', async () => {
    const archive = await createPayloadDir();
    const contentManifest = createMediaManifest({
      id: '@test/local-content',
      name: 'local-content',
      source: {
        kind: 'local',
        path: '${NEKO_HOME}/local/media/local-content/1.0.0',
        storageMode: 'copy-managed',
      },
    });
    const manager = createManager({
      archive,
      manifest: createBundleManifest('@test/bundle', ['@test/local-content']),
      packages: { '@test/local-content': contentManifest },
      target: createTarget({ type: 'bundle' }),
    });

    const result = await manager.install('@test/bundle', '1.0.0');

    expect(result.success).toBe(false);
    expect(result.error).toContain('sideload asset');
  });

  it('skips sideload assets during market update checks', async () => {
    const installed = await createInstalledRegistry();
    const localInstalledManifest = createMediaManifest({
      id: '@test/local-media',
      name: 'local-media',
      version: '1.0.0',
      source: {
        kind: 'local',
        path: '${NEKO_HOME}/local/media/local-media/1.0.0',
        storageMode: 'copy-managed',
      },
    });
    const marketInstalledManifest = createMediaManifest({
      id: '@test/market-media',
      name: 'market-media',
      version: '1.0.0',
    });
    const marketLatestManifest = createMediaManifest({
      id: '@test/market-media',
      name: 'market-media',
      version: '2.0.0',
      source: {
        kind: 'registry',
        registry: 'test',
        package: '@test/market-media',
        version: '2.0.0',
        integrity: 'sha256-test',
      },
    });

    await installed.add(
      createInstalledPackage({
        packageId: '@test/local-media',
        version: '1.0.0',
        type: 'media',
        manifest: localInstalledManifest,
      }),
    );
    await installed.add(
      createInstalledPackage({
        packageId: '@test/market-media',
        version: '1.0.0',
        type: 'media',
        manifest: marketInstalledManifest,
      }),
    );

    const manager = createManager({
      installed,
      target: createTarget({ type: 'media' }),
      manifest: marketLatestManifest,
      packages: {
        '@test/local-media': createMediaManifest({
          id: '@test/local-media',
          name: 'local-media',
          version: '2.0.0',
        }),
      },
    });

    const updates = await manager.checkUpdates();

    expect(updates).toEqual([
      expect.objectContaining({
        packageId: '@test/market-media',
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
      }),
    ]);
  });

  it('blocks local shaders and models when validators report diagnostics', async () => {
    const archive = await createPayloadDir();
    const shaderValidator = vi
      .fn()
      .mockReturnValue([
        { field: 'typeMetadata.data.localValidation', message: 'SPIR-V validator failed' },
      ]);
    const shaderManager = createManager({
      archive,
      target: createTarget({ type: 'shader' }),
      manifest: createLocalShaderManifest(),
      config: {
        workspaceTrustLevel: 'trusted',
        localAssetValidator: { validateShader: shaderValidator },
      },
    });

    const shaderResult = await shaderManager.install('@test/shader', '1.0.0');

    expect(shaderResult.success).toBe(false);
    expect(shaderResult.error).toContain('SPIR-V validator failed');
    expect(shaderValidator).toHaveBeenCalledTimes(1);

    const modelValidator = vi
      .fn()
      .mockReturnValue([
        { field: 'typeMetadata.data.localValidation', message: 'VRAM limit exceeded' },
      ]);
    const modelManager = createManager({
      archive,
      target: createTarget({ type: 'model' }),
      manifest: createLocalModelManifest(),
      config: {
        workspaceTrustLevel: 'trusted',
        localAssetValidator: { validateModel: modelValidator },
      },
    });

    const modelResult = await modelManager.install('@test/model', '1.0.0');

    expect(modelResult.success).toBe(false);
    expect(modelResult.error).toContain('VRAM limit exceeded');
    expect(modelValidator).toHaveBeenCalledTimes(1);
  });

  it('blocks resource quota and unsupported optional server capabilities', async () => {
    const archive = await createPayloadDir();
    const quotaManager = createManager({
      archive,
      manifest: createManifest({
        source: { kind: 'local', path: archive },
        effects: { resources: { diskMB: 2048 } },
      }),
      config: { maxDiskMB: 1024 },
    });

    await expect(quotaManager.install('@test/skill', '1.0.0')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('exceeds quota'),
    });

    const capabilityManager = createManager({
      archive,
      manifest: createMediaManifest({
        id: '@test/media-large',
        name: 'media-large',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['sparse'],
          totalSize: 100,
          sparseItems: [{ itemId: 'a', name: 'A', size: 10 }],
        },
      }),
      target: createTarget({ type: 'media' }),
      config: { serverCapabilities: [] },
    });

    await expect(capabilityManager.install('@test/media-large', '1.0.0')).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('capability'),
    });
  });

  it('records recommended variant large asset state and updates sparse item state', async () => {
    const archive = await createPayloadDir();
    const variantInstalled = await createInstalledRegistry();
    const variantManager = createManager({
      archive,
      installed: variantInstalled,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/variant-media',
        name: 'variant-media',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['variant'],
          totalSize: 300,
          variants: [
            { variantId: 'small', size: 100 },
            { variantId: 'large', size: 300, recommended: true },
          ],
        },
      }),
    });

    const variantResult = await variantManager.install('@test/variant-media', '1.0.0');
    expect(variantResult.success).toBe(true);
    expect(variantInstalled.get('@test/variant-media')?.largeAsset).toMatchObject({
      state: 'full',
      selectedVariantId: 'large',
      downloadedSize: 300,
    });

    const sparseInstalled = await createInstalledRegistry();
    const sparseManager = createManager({
      archive,
      installed: sparseInstalled,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/sparse-media',
        name: 'sparse-media',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['sparse'],
          totalSize: 30,
          sparseItems: [
            { itemId: 'a', name: 'A', size: 10, defaultSelected: true },
            { itemId: 'b', name: 'B', size: 20 },
          ],
        },
      }),
    });

    const sparseResult = await sparseManager.install('@test/sparse-media', '1.0.0');
    expect(sparseResult.success).toBe(true);
    expect(sparseInstalled.get('@test/sparse-media')?.largeAsset).toMatchObject({
      state: 'partial',
      downloadedItems: ['a'],
      downloadedSize: 10,
    });

    await sparseManager.ensureFull('@test/sparse-media', 'b');

    expect(sparseInstalled.get('@test/sparse-media')?.largeAsset).toMatchObject({
      state: 'full',
      downloadedItems: ['a', 'b'],
      downloadedSize: 30,
    });
  });

  it('upgrades proxy to full quality through descriptor download and preserves proxy on failure', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const payload = new TextEncoder().encode('full-quality-proxy');
    const descriptor = createDescriptor({
      url: 'https://cdn.test/original.bin',
      size: payload.byteLength,
      integrity: sri(payload),
      resumable: false,
    });
    const manager = createManager({
      archive,
      installed,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/proxy-media',
        name: 'proxy-media',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['proxy'],
          totalSize: 100,
          proxyVariants: [
            { qualityTag: 'low', size: 10, default: true },
            { qualityTag: 'original', size: 100 },
          ],
        },
      }),
      getProxyVariantDownloadDescriptor: vi.fn().mockResolvedValue(descriptor),
    });

    const installResult = await manager.install('@test/proxy-media', '1.0.0');
    expect(installResult.success).toBe(true);
    expect(installed.get('@test/proxy-media')?.largeAsset).toMatchObject({
      state: 'proxy',
      proxyQuality: 'low',
    });

    mockFetch.mockResolvedValueOnce(binaryResponse(payload));
    const fullResult = await manager.ensureFull('@test/proxy-media');

    expect(fullResult.success).toBe(true);
    expect(installed.get('@test/proxy-media')?.largeAsset).toMatchObject({
      state: 'full',
      proxyQuality: 'original',
      downloadedSize: payload.byteLength,
    });

    const failingInstalled = await createInstalledRegistry();
    const failingManager = createManager({
      archive,
      installed: failingInstalled,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/proxy-fail',
        name: 'proxy-fail',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['proxy'],
          totalSize: 100,
          proxyVariants: [
            { qualityTag: 'low', size: 10, default: true },
            { qualityTag: 'original', size: 100 },
          ],
        },
      }),
      getProxyVariantDownloadDescriptor: vi.fn().mockResolvedValue(
        createDescriptor({
          url: 'https://cdn.test/bad.bin',
          size: payload.byteLength,
          integrity: 'sha256-invalid',
          resumable: false,
        }),
      ),
    });
    expect((await failingManager.install('@test/proxy-fail', '1.0.0')).success).toBe(true);
    mockFetch.mockResolvedValueOnce(binaryResponse(payload));

    const failed = await failingManager.ensureFull('@test/proxy-fail');

    expect(failed.success).toBe(false);
    expect(failingInstalled.get('@test/proxy-fail')?.largeAsset).toMatchObject({
      state: 'proxy',
      proxyQuality: 'low',
      downloadedSize: 10,
    });
  });

  it('uses full fallback bytes before marking a delta large asset full', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const payload = new TextEncoder().encode('delta-patch');
    const fullPayload = new TextEncoder().encode('full-delta-target');
    const descriptor = {
      url: 'https://cdn.test/delta.bin',
      size: payload.byteLength,
      integrity: sri(payload),
      patchFormat: 'xdelta3' as const,
      fallbackUrl: 'https://cdn.test/full.bin',
    };
    const fullDescriptor = createDescriptor({
      url: 'https://cdn.test/full-original.bin',
      size: fullPayload.byteLength,
      integrity: sri(fullPayload),
      resumable: false,
    });
    const getDeltaDownloadDescriptor = vi.fn().mockResolvedValue(descriptor);
    const getDownloadDescriptor = vi.fn().mockResolvedValue(fullDescriptor);
    const manager = createManager({
      archive,
      installed,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/delta-media',
        name: 'delta-media',
        version: '1.1.0',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['delta'],
          totalSize: 100,
          deltaBase: { version: '1.0.0', deltaUrl: 'https://cdn.test/delta.bin', deltaSize: 10 },
        },
      }),
      getDeltaDownloadDescriptor,
      getDownloadDescriptor,
    });

    expect((await manager.install('@test/delta-media', '1.1.0')).success).toBe(true);
    mockFetch.mockResolvedValueOnce(binaryResponse(fullPayload));

    const result = await manager.ensureFull('@test/delta-media');

    expect(result.success).toBe(true);
    expect(getDeltaDownloadDescriptor).toHaveBeenCalledWith('@test/delta-media', '1.0.0', '1.1.0');
    expect(getDownloadDescriptor).toHaveBeenCalledWith('@test/delta-media', '1.1.0');
    expect(installed.get('@test/delta-media')?.largeAsset).toMatchObject({
      state: 'full',
      downloadedSize: fullPayload.byteLength,
    });
  });

  it('preserves delta large asset state when full fallback verification fails', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const payload = new TextEncoder().encode('bad-full-delta-target');
    const manager = createManager({
      archive,
      installed,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/delta-fail',
        name: 'delta-fail',
        version: '1.1.0',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['delta'],
          totalSize: 100,
          deltaBase: { version: '1.0.0', deltaUrl: 'https://cdn.test/delta.bin', deltaSize: 10 },
        },
      }),
      getDeltaDownloadDescriptor: vi.fn().mockResolvedValue({
        url: 'https://cdn.test/delta.bin',
        size: 10,
        integrity: sri(new TextEncoder().encode('delta-patch')),
        patchFormat: 'xdelta3' as const,
        fallbackUrl: 'https://cdn.test/full.bin',
      }),
      getDownloadDescriptor: vi.fn().mockResolvedValue(
        createDescriptor({
          url: 'https://cdn.test/full-original.bin',
          size: payload.byteLength,
          integrity: 'sha256-invalid',
          resumable: false,
        }),
      ),
    });

    expect((await manager.install('@test/delta-fail', '1.1.0')).success).toBe(true);
    mockFetch.mockResolvedValueOnce(binaryResponse(payload));

    const result = await manager.ensureFull('@test/delta-fail');

    expect(result.success).toBe(false);
    expect(installed.get('@test/delta-fail')?.largeAsset).toMatchObject({
      state: 'owned',
      downloadedSize: 0,
    });
  });

  it('cancels an in-flight proxy upgrade download and keeps proxy state', async () => {
    const archive = await createPayloadDir();
    const installed = await createInstalledRegistry();
    const payload = new TextEncoder().encode('full-quality-proxy');
    const manager = createManager({
      archive,
      installed,
      target: createTarget({ type: 'media' }),
      manifest: createMediaManifest({
        id: '@test/proxy-cancel',
        name: 'proxy-cancel',
        source: { kind: 'local', path: archive },
        largeAsset: {
          modes: ['proxy'],
          totalSize: 100,
          proxyVariants: [
            { qualityTag: 'low', size: 10, default: true },
            { qualityTag: 'original', size: 100 },
          ],
        },
      }),
      getProxyVariantDownloadDescriptor: vi.fn().mockResolvedValue(
        createDescriptor({
          url: 'https://cdn.test/cancel.bin',
          size: payload.byteLength,
          integrity: sri(payload),
          resumable: false,
        }),
      ),
    });

    expect((await manager.install('@test/proxy-cancel', '1.0.0')).success).toBe(true);
    mockFetch.mockImplementationOnce((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Download aborted', 'AbortError'));
        });
      });
    });

    const running = manager.ensureFull('@test/proxy-cancel');
    await waitUntil(() => mockFetch.mock.calls.length > 0);

    expect(manager.cancelInstall('@test/proxy-cancel')).toBe(true);
    await expect(running).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('cancelled'),
    });
    expect(installed.get('@test/proxy-cancel')?.largeAsset).toMatchObject({
      state: 'proxy',
      proxyQuality: 'low',
    });
  });
});

function createManager(options: {
  archive?: string;
  descriptor?: DownloadDescriptor;
  effectsInverter?: EffectsInverter;
  effectsActivator?: EffectsActivator;
  getDownloadDescriptor?: (packageId: string, version: string) => Promise<DownloadDescriptor>;
  getProxyVariantDownloadDescriptor?: IMarketClient['getProxyVariantDownloadDescriptor'];
  getDeltaDownloadDescriptor?: IMarketClient['getDeltaDownloadDescriptor'];
  installed?: InstalledRegistry;
  licenseResult?: { allowed: boolean; reason?: string; expiresAt?: number };
  manifest?: AssetManifest;
  packages?: Record<string, AssetManifest>;
  entitlementResult?: EntitlementCheck;
  target?: IInstallTarget<AssetType>;
  targets?: IInstallTarget<AssetType>[];
  config?: Partial<ConstructorParameters<typeof InstallManager>[6]>;
}): InstallManager {
  const manifest = options.manifest ?? createManifest();
  const manifests = {
    [manifest.id]: manifest,
    ...(options.packages ?? {}),
  };
  const descriptor = options.descriptor ?? createDescriptor();
  const client: IMarketClient = {
    search: vi.fn(),
    getPackage: vi.fn().mockImplementation((packageId: string) => {
      const found = manifests[packageId];
      return Promise.resolve(
        found ? { id: found.id, manifest: found, installState: 'not-installed' } : undefined,
      );
    }),
    getVersions: vi.fn().mockImplementation((packageId: string) => {
      const found = manifests[packageId];
      return Promise.resolve(
        found
          ? [
              {
                version: found.version,
                releasedAt: found.createdAt,
                downloadSize: found.largeAsset?.totalSize ?? 1,
              },
            ]
          : [],
      );
    }),
    getDownloadDescriptor: options.getDownloadDescriptor ?? vi.fn().mockResolvedValue(descriptor),
    getFeatured: vi.fn(),
    setAuthToken: vi.fn(),
    getServerInfo: vi.fn(),
    getSparseManifest: vi.fn(),
    reportSparseSelection: vi.fn(),
    getVariantDownloadDescriptor: vi.fn(),
    getProxyVariantDownloadDescriptor: options.getProxyVariantDownloadDescriptor ?? vi.fn(),
    getDeltaDownloadDescriptor: options.getDeltaDownloadDescriptor ?? vi.fn(),
    listEntitlements: vi.fn(),
    getEntitlementChanges: vi.fn(),
    refreshEntitlements: vi.fn(),
    checkEntitlement: vi.fn().mockResolvedValue(options.entitlementResult),
    getCheckoutUrl: vi.fn(),
    requestPluginBuild: vi.fn(),
    getPluginBuildStatus: vi.fn(),
    getPluginBuildResult: vi.fn(),
    submitPublisherVerification: vi.fn(),
    getPublisherVerificationStatus: vi.fn(),
    reportPermissionViolation: vi.fn(),
    getSemanticOntology: vi.fn(),
    getIntentOntology: vi.fn(),
    getDeprecation: vi.fn(),
  };
  const cache: ICacheManager = {
    getCachedPath: vi.fn().mockResolvedValue(options.archive),
    cacheFile: vi.fn(),
    evict: vi.fn(),
    getSize: vi.fn(),
    prune: vi.fn(),
  };
  const license: ILicenseManager = {
    verify: vi.fn().mockResolvedValue(options.licenseResult ?? { allowed: true }),
  };
  const versionResolver: IVersionResolver = {
    satisfies: vi.fn((candidate: string, range: string) => satisfiesRange(candidate, range)),
    maxSatisfying: vi.fn((versions: string[], range: string) =>
      [...versions].reverse().find((candidate) => satisfiesRange(candidate, range)),
    ),
    compare: vi.fn((a: string, b: string) => (a === b ? 0 : a > b ? 1 : -1)),
    isCompatible: vi.fn().mockReturnValue(true),
  };
  const targets = new InstallTargetRegistry();
  targets.register(options.target ?? createTarget());
  for (const extraTarget of options.targets ?? []) {
    targets.register(extraTarget);
  }

  return new InstallManager(
    client,
    cache,
    license,
    versionResolver,
    targets,
    options.installed ??
      new InstalledRegistry(join(tmpdir(), `neko-market-installed-${Math.random()}.json`)),
    {
      nekoSuiteVersion: '1.0.0',
      downloadTempDir: join(tmpdir(), 'neko-market-downloads'),
      effectsActivator: options.effectsActivator,
      effectsInverter: options.effectsInverter,
      ...options.config,
    },
  );
}

function satisfiesRange(candidate: string, range: string): boolean {
  if (range === '*' || range === '' || candidate === range) return true;
  if (range.startsWith('^')) {
    const [candidateMajor] = candidate.split('.');
    const [rangeMajor] = range.slice(1).split('.');
    return candidateMajor === rangeMajor;
  }
  return false;
}

function createTarget(
  overrides: Partial<IInstallTarget<AssetType>> = {},
): IInstallTarget<AssetType> {
  return {
    type: 'skill',
    getInstallPath: vi.fn(() => join(tmpdir(), `neko-market-install-${Math.random()}`)),
    validateManifest: vi.fn(),
    onPreInstall: vi.fn(),
    onPostInstall: vi.fn(),
    onPreUninstall: vi.fn(),
    onRollback: vi.fn(),
    ...overrides,
  };
}

function createManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    id: '@test/skill',
    name: 'skill',
    version: '1.0.0',
    type: 'skill',
    source: {
      kind: 'registry',
      registry: 'test',
      package: '@test/skill',
      version: '1.0.0',
      integrity: 'sha256-test',
    },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'skill',
      data: { domain: ['video-edit'] },
    },
    distribution: {
      license: 'MIT',
      author: 'test',
      tags: ['skill'],
      checksum: 'sha256-test',
      signature: { algorithm: 'sha256', value: 'manifest' },
    },
    intent: {
      useCases: ['video-editing'],
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createPluginDistribution(
  overrides: Partial<NonNullable<AssetManifest['distribution']>> = {},
): NonNullable<AssetManifest['distribution']> {
  return {
    license: 'MIT',
    author: 'plugin-publisher',
    tags: ['plugin'],
    checksum: 'sha256-test',
    trustLevel: 'community',
    publisher: {
      id: 'verified-publisher',
      displayName: 'Verified Publisher',
      verified: true,
      verificationTier: 'verified',
    },
    signature: { algorithm: 'sha256', value: 'manifest' },
    ...overrides,
  };
}

function createPluginManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return createManifest({
    id: '@test/plugin',
    name: 'plugin',
    type: 'plugin',
    source: {
      kind: 'registry',
      registry: 'test',
      package: '@test/plugin',
      version: '1.0.0',
      integrity: 'sha256-test',
    },
    typeMetadata: {
      type: 'plugin',
      data: {
        entryPoint: 'neko_plugin_init',
        apiVersion: '1',
        permissions: [],
        engineRequirements: {
          minVersion: '1.0.0',
          targetTriple: 'aarch64-apple-darwin',
          runtimeArtifacts: ['cdylib'],
        },
      },
    },
    distribution: createPluginDistribution(),
    ...overrides,
  });
}

function createLocalPluginManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return createPluginManifest({
    source: {
      kind: 'local',
      path: '${NEKO_HOME}/local/plugin/test-plugin/1.0.0',
      storageMode: 'copy-managed',
    },
    distribution: undefined,
    ...overrides,
  });
}

function createMediaManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return createManifest({
    id: '@test/media',
    name: 'media',
    type: 'media',
    typeMetadata: {
      type: 'media',
      data: {
        mediaKind: 'image',
        fileSize: 1,
        image: { resolution: [1, 1] },
      },
    },
    source: {
      kind: 'registry',
      registry: 'test',
      package: '@test/media',
      version: '1.0.0',
      integrity: 'sha256-test',
    },
    distribution: {
      license: 'MIT',
      author: 'test',
      tags: ['media'],
      checksum: 'sha256-test',
      signature: { algorithm: 'sha256', value: 'manifest' },
    },
    ...overrides,
  });
}

function createLocalShaderManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return createManifest({
    id: '@test/shader',
    name: 'shader',
    type: 'shader',
    source: {
      kind: 'local',
      path: '${NEKO_HOME}/local/shader/test-shader/1.0.0',
      storageMode: 'copy-managed',
    },
    typeMetadata: {
      type: 'shader',
      data: {
        shaderKind: 'standalone',
        language: 'wgsl',
        stage: 'fragment',
        inputs: [],
        artifactForm: 'spirv-binary',
        localValidation: {
          validator: 'spirv-val',
          sourceWarning: true,
        },
      },
    },
    distribution: undefined,
    ...overrides,
  });
}

function createLocalModelManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return createManifest({
    id: '@test/model',
    name: 'model',
    type: 'model',
    source: {
      kind: 'local',
      path: '${NEKO_HOME}/local/model/test-model/1.0.0',
      storageMode: 'copy-managed',
    },
    typeMetadata: {
      type: 'model',
      data: {
        modelKind: 'base',
        framework: 'onnx',
        task: 'vision',
        size: 1,
        localValidation: {
          sourceWarning: true,
          formatProbe: {
            detectedFramework: 'onnx',
            fileSize: 1,
          },
          resourcePolicy: {
            maxRamMB: 1024,
            maxVramMB: 1024,
          },
        },
      },
    },
    distribution: undefined,
    ...overrides,
  });
}

function createBundleManifest(id: string, contentIds: string[]): AssetManifest {
  return createManifest({
    id,
    name: id.split('/').at(-1) ?? id,
    type: 'bundle',
    distributionKind: 'orchestration',
    typeMetadata: {
      type: 'bundle',
      data: { installPolicy: 'all' },
    },
    contents: contentIds.map((packageId) => ({ packageId, version: '^1.0.0' })),
  });
}

function createInstalledPackage(overrides: Partial<InstalledPackage> = {}): InstalledPackage {
  const manifest = overrides.manifest ?? createManifest();
  return {
    packageId: manifest.id,
    version: manifest.version,
    type: manifest.type,
    installedAt: Date.now(),
    installedPath: join(tmpdir(), `neko-market-installed-package-${Math.random()}`),
    manifest,
    enabled: true,
    requested: true,
    status: 'active',
    ...overrides,
  };
}

function createDescriptor(overrides: Partial<DownloadDescriptor> = {}): DownloadDescriptor {
  return {
    url: 'https://cdn.test/skill.tar.gz',
    expiresAt: 1,
    size: 1,
    integrity: 'sha256-test',
    resumable: true,
    ...overrides,
  };
}

function binaryResponse(data: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-length': String(data.byteLength) }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    }),
  } as Response;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for condition');
}

function sri(data: Uint8Array): string {
  return `sha256-${createHash('sha256').update(data).digest('base64')}`;
}

async function createPayloadDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'neko-market-payload-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'payload'), { recursive: true });
  await writeFile(join(dir, 'payload', 'SKILL.md'), '# skill\n', 'utf-8');
  return dir;
}

async function createInstalledRegistry(): Promise<InstalledRegistry> {
  const dir = await mkdtemp(join(tmpdir(), 'neko-market-installed-'));
  tempDirs.push(dir);
  const registry = new InstalledRegistry(join(dir, 'market-installed.json'));
  await registry.load();
  return registry;
}
