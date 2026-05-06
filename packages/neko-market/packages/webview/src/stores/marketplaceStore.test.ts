import { beforeEach, describe, expect, it } from 'vitest';
import { useMarketplaceStore } from './marketplaceStore';

describe('marketplaceStore', () => {
  beforeEach(() => {
    useMarketplaceStore.setState({
      activeTab: 'browse',
      assetTypeFilter: 'all',
      browseFilters: { category: 'all', type: 'all', pricing: 'all', sort: 'featured' },
      serverInfo: null,
      governance: {
        developerMode: { enabled: false, active: false },
        workspaceTrust: { level: 'restricted', canPromote: true },
      },
      searchText: '',
      featured: [],
      searchResults: [],
      selectedPackage: null,
      searchTotal: 0,
      isSearching: false,
      installed: [],
      localInstallDraft: null,
      entitlements: { items: [], isRefreshing: false },
      updates: [],
      largeAssetPicker: null,
      installProgress: new Map(),
      error: null,
    });
  });

  it('builds a v4 browse query from category, type, kind, and sort filters', () => {
    useMarketplaceStore.getState().setSearchText('warm lut');
    useMarketplaceStore.getState().setBrowseFilters({
      category: 'tooling',
      type: 'preset',
      kind: 'lut',
      pricing: 'free',
      sort: 'created',
    });

    expect(useMarketplaceStore.getState().buildBrowseQuery()).toEqual({
      text: 'warm lut',
      category: 'tooling',
      types: ['preset'],
      semantic: { kind: 'lut' },
      pricing: 'free',
      sort: 'created',
      order: 'desc',
    });
  });

  it('stores owned-not-installed entitlements separately from installed packages', () => {
    useMarketplaceStore.getState().setInstalled([]);
    useMarketplaceStore.getState().setEntitlements(
      [
        {
          packageId: '@studio/paid-media',
          grantedAt: 1,
          source: 'purchase',
          state: 'owned-not-installed',
        },
      ],
      'etag-1',
    );

    expect(useMarketplaceStore.getState().installed).toEqual([]);
    expect(useMarketplaceStore.getState().entitlements.items[0]?.state).toBe('owned-not-installed');
  });

  it('routes between the four top-level marketplace tabs', () => {
    for (const tab of ['browse', 'installed', 'owned', 'updates'] as const) {
      useMarketplaceStore.getState().setActiveTab(tab);
      expect(useMarketplaceStore.getState().activeTab).toBe(tab);
    }
  });

  it('tracks installed status badges and large asset picker state', () => {
    useMarketplaceStore.getState().setInstalled([
      {
        packageId: '@studio/model',
        name: 'Model',
        version: '1.0.0',
        type: 'model',
        category: 'ai',
        installedAt: '2026-05-05T00:00:00.000Z',
        installedPath: '/tmp/model',
        enabled: true,
        status: 'expired',
        largeAsset: { state: 'proxy', downloadedSize: 100, totalSize: 200 },
      },
    ]);
    useMarketplaceStore.getState().openLargeAssetPicker({
      packageId: '@studio/model',
      mode: 'variant',
      selectedItems: [],
      totalSize: 200,
      selectedSize: 100,
      isSupported: true,
      isOpen: true,
    });

    expect(useMarketplaceStore.getState().installed[0]?.status).toBe('expired');
    expect(useMarketplaceStore.getState().largeAssetPicker?.mode).toBe('variant');
  });

  it('selects the recommended variant by default when opening the picker', () => {
    useMarketplaceStore.getState().openLargeAssetPicker({
      packageId: '@studio/model',
      mode: 'variant',
      variants: [
        { variantId: 'q4', size: 40 },
        { variantId: 'fp16', size: 160, recommended: true },
      ],
      selectedItems: [],
      isSupported: true,
      isOpen: true,
    });

    expect(useMarketplaceStore.getState().largeAssetPicker).toMatchObject({
      selectedVariantId: 'fp16',
      selectedSize: 160,
    });
  });

  it('preserves an explicit variant selection when opening the picker', () => {
    useMarketplaceStore.getState().openLargeAssetPicker({
      packageId: '@studio/model',
      mode: 'variant',
      variants: [
        { variantId: 'q4', size: 40 },
        { variantId: 'fp16', size: 160, recommended: true },
      ],
      selectedVariantId: 'q4',
      selectedSize: 40,
      selectedItems: [],
      isSupported: true,
      isOpen: true,
    });

    expect(useMarketplaceStore.getState().largeAssetPicker).toMatchObject({
      selectedVariantId: 'q4',
      selectedSize: 40,
    });
  });

  it('stores server capabilities for graceful browse filter degradation', () => {
    useMarketplaceStore.getState().setServerInfo({
      version: '1.0.0',
      capabilities: ['search.pricing'],
    });

    expect(useMarketplaceStore.getState().serverInfo?.capabilities).toEqual(['search.pricing']);
  });

  it('stores Developer Mode, Workspace Trust, and local install draft state', () => {
    useMarketplaceStore.getState().setGovernance({
      developerMode: {
        enabled: true,
        active: true,
        expiresAt: 123,
        riskAcceptedAt: 1,
      },
      workspaceTrust: {
        level: 'trusted',
        canPromote: false,
      },
    });
    useMarketplaceStore.getState().setLocalInstallDraft({
      draftId: 'draft-1',
      assetType: 'plugin',
      assetName: 'Local Plugin',
      sourcePathLabel: '${WORKSPACE}/plugin.dylib',
      storageMode: 'local-link',
      warnings: [{ code: 'native-plugin', severity: 'warning' }],
    });

    expect(useMarketplaceStore.getState().governance.developerMode.active).toBe(true);
    expect(useMarketplaceStore.getState().governance.workspaceTrust.level).toBe('trusted');
    expect(useMarketplaceStore.getState().localInstallDraft).toMatchObject({
      draftId: 'draft-1',
      storageMode: 'local-link',
    });
  });

  it('tracks local installed source metadata and governance warnings', () => {
    useMarketplaceStore.getState().setInstalled([
      {
        packageId: '@local/plugin',
        name: 'Plugin',
        version: '1.0.0',
        type: 'plugin',
        installedAt: '2026-05-05T00:00:00.000Z',
        installedPath: '${NEKO_HOME}/local/plugin/local-plugin/1.0.0',
        enabled: false,
        sourceKind: 'local',
        storageMode: 'copy-managed',
        governanceWarnings: [
          { code: 'local-source', severity: 'info' },
          { code: 'developer-mode', severity: 'blocked' },
        ],
      },
    ]);

    expect(useMarketplaceStore.getState().installed[0]).toMatchObject({
      sourceKind: 'local',
      storageMode: 'copy-managed',
      governanceWarnings: [
        { code: 'local-source', severity: 'info' },
        { code: 'developer-mode', severity: 'blocked' },
      ],
    });
  });

  it('keeps active progress while clearing terminal install phases', () => {
    useMarketplaceStore.getState().setInstallProgress({
      packageId: '@studio/media',
      phase: 'fetch',
      percent: 45,
    });
    expect(useMarketplaceStore.getState().installProgress.get('@studio/media')?.phase).toBe(
      'fetch',
    );

    useMarketplaceStore.getState().setInstallProgress({
      packageId: '@studio/media',
      phase: 'done',
      percent: 100,
    });
    expect(useMarketplaceStore.getState().installProgress.has('@studio/media')).toBe(false);
  });
});
