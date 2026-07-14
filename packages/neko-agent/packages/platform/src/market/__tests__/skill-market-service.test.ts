import { describe, expect, it, vi } from 'vitest';
import type { AssetManifest, IInstallManager, IMarketClient, InstallProgress } from '@neko/shared';
import { SkillMarketService } from '../skill-market-service';

describe('SkillMarketService', () => {
  it('rejects construction without a Host-injected local metadata install manager', () => {
    expect(() => new SkillMarketService({} as never)).toThrow(
      'Host-injected InstallManager backed by LocalMetadataInstalledRegistry',
    );
  });

  it('scopes search and featured requests to skill packages', async () => {
    const client = createMarketClientMock();
    client.search.mockResolvedValue({ items: [], total: 0, hasMore: false });
    client.getFeatured.mockResolvedValue([]);
    const service = new SkillMarketService({
      client,
      installManager: createInstallManagerMock(),
    });

    await service.search({ text: 'camera', tags: ['shot'] });
    await service.getFeatured();

    expect(client.search).toHaveBeenCalledWith({
      text: 'camera',
      tags: ['shot'],
      types: ['skill'],
    });
    expect(client.getFeatured).toHaveBeenCalledWith('skill');
  });

  it('forwards install progress callback and returns install result', async () => {
    const installManager = createInstallManagerMock();
    const progress: InstallProgress = {
      packageId: '@pub/camera-shot',
      phase: 'done',
      percent: 100,
    };
    installManager.install.mockImplementation(async (_packageId, _version, onProgress) => {
      onProgress?.(progress);
      return { success: true, installedPath: '/tmp/skill' };
    });
    const onProgress = vi.fn<(progress: InstallProgress) => void>();
    const service = new SkillMarketService({
      client: createMarketClientMock(),
      installManager,
    });

    await expect(service.install('@pub/camera-shot', '1.0.0', onProgress)).resolves.toEqual({
      success: true,
      installedPath: '/tmp/skill',
    });

    expect(installManager.install).toHaveBeenCalledWith('@pub/camera-shot', '1.0.0', onProgress);
    expect(onProgress).toHaveBeenCalledWith(progress);
  });

  it('filters installed packages to skills and refreshes after uninstall', async () => {
    const installManager = createInstallManagerMock();
    installManager.listInstalled.mockResolvedValue([
      {
        packageId: '@pub/camera-shot',
        version: '1.0.0',
        type: 'skill',
        installedAt: 1,
        installedPath: '/tmp/skill',
        manifest: createSkillManifest(),
        enabled: true,
      },
      {
        packageId: '@pub/shader',
        version: '1.0.0',
        type: 'shader',
        installedAt: 1,
        installedPath: '/tmp/shader',
        manifest: { ...createSkillManifest(), id: '@pub/shader', name: 'shader', type: 'shader' },
        enabled: true,
      },
    ]);
    const refreshSkills = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const service = new SkillMarketService({
      client: createMarketClientMock(),
      installManager,
      refreshSkills,
    });

    await expect(service.listInstalled()).resolves.toHaveLength(1);
    await service.uninstall('@pub/camera-shot');

    expect(installManager.uninstall).toHaveBeenCalledWith('@pub/camera-shot');
    expect(refreshSkills).toHaveBeenCalledTimes(1);
  });
});

function createMarketClientMock() {
  return {
    search: vi.fn<IMarketClient['search']>(),
    getPackage: vi.fn<IMarketClient['getPackage']>(),
    getVersions: vi.fn<IMarketClient['getVersions']>(),
    getDownloadDescriptor: vi.fn<IMarketClient['getDownloadDescriptor']>(),
    getDownloadUrl: vi.fn<IMarketClient['getDownloadUrl']>(),
    getFeatured: vi.fn<IMarketClient['getFeatured']>(),
    setAuthToken: vi.fn<IMarketClient['setAuthToken']>(),
    setRegistryUrl: vi.fn<NonNullable<IMarketClient['setRegistryUrl']>>(),
    getServerInfo: vi.fn<IMarketClient['getServerInfo']>(),
    getSparseManifest: vi.fn<IMarketClient['getSparseManifest']>(),
    reportSparseSelection: vi.fn<IMarketClient['reportSparseSelection']>(),
    getVariantDownloadDescriptor: vi.fn<IMarketClient['getVariantDownloadDescriptor']>(),
    getProxyVariantDownloadDescriptor: vi.fn<IMarketClient['getProxyVariantDownloadDescriptor']>(),
    getDeltaDownloadDescriptor: vi.fn<IMarketClient['getDeltaDownloadDescriptor']>(),
    listEntitlements: vi.fn<IMarketClient['listEntitlements']>(),
    getEntitlementChanges: vi.fn<IMarketClient['getEntitlementChanges']>(),
    refreshEntitlements: vi.fn<IMarketClient['refreshEntitlements']>(),
    checkEntitlement: vi.fn<IMarketClient['checkEntitlement']>(),
    getCheckoutUrl: vi.fn<IMarketClient['getCheckoutUrl']>(),
    requestPluginBuild: vi.fn<IMarketClient['requestPluginBuild']>(),
    getPluginBuildStatus: vi.fn<IMarketClient['getPluginBuildStatus']>(),
    getPluginBuildResult: vi.fn<IMarketClient['getPluginBuildResult']>(),
    submitPublisherVerification: vi.fn<IMarketClient['submitPublisherVerification']>(),
    getPublisherVerificationStatus: vi.fn<IMarketClient['getPublisherVerificationStatus']>(),
    reportPermissionViolation: vi.fn<IMarketClient['reportPermissionViolation']>(),
    getSemanticOntology: vi.fn<IMarketClient['getSemanticOntology']>(),
    getIntentOntology: vi.fn<IMarketClient['getIntentOntology']>(),
    getDeprecation: vi.fn<IMarketClient['getDeprecation']>(),
  } satisfies IMarketClient;
}

function createInstallManagerMock() {
  return {
    install: vi.fn<IInstallManager['install']>(),
    uninstall: vi.fn<IInstallManager['uninstall']>().mockResolvedValue(undefined),
    update: vi.fn<IInstallManager['update']>(),
    enable: vi.fn<IInstallManager['enable']>(),
    disable: vi.fn<IInstallManager['disable']>(),
    listInstalled: vi.fn<IInstallManager['listInstalled']>().mockResolvedValue([]),
    checkUpdates: vi.fn<IInstallManager['checkUpdates']>().mockResolvedValue([]),
    ensureFull: vi.fn<NonNullable<IInstallManager['ensureFull']>>(),
  } satisfies IInstallManager;
}

function createSkillManifest(): AssetManifest {
  return {
    id: '@pub/camera-shot',
    name: 'camera-shot',
    version: '1.0.0',
    type: 'skill',
    source: { kind: 'registry', registry: 'test', package: '@pub/camera-shot', version: '1.0.0' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'pub',
      tags: ['skill'],
      checksum: 'sha256-test',
      publisherId: 'pub',
    },
    createdAt: 0,
    updatedAt: 0,
  };
}
