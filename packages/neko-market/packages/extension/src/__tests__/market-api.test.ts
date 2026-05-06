/**
 * Tests for NekoMarketAPI and NekoMarketAPIImpl
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NekoMarketAPI } from '../market-api';
import { NekoMarketAPIImpl } from '../market-api';
import type { MarketplaceService } from '../MarketplaceService';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('vscode', () => {
  return { EventEmitter: MockEventEmitter };
});

class MockEventEmitter {
  private listeners: Array<(e: unknown) => void> = [];
  event = (listener: (e: unknown) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };
  fire(data: unknown) {
    this.listeners.forEach((l) => l(data));
  }
  dispose() {
    this.listeners = [];
  }
}

function createMockService() {
  const onDidInstallEmitter = new MockEventEmitter();
  const onDidUninstallEmitter = new MockEventEmitter();
  const onDidEnableEmitter = new MockEventEmitter();
  const onDidDisableEmitter = new MockEventEmitter();
  const onDidMarketPackageEventEmitter = new MockEventEmitter();

  return {
    onDidInstall: onDidInstallEmitter.event,
    onDidUninstall: onDidUninstallEmitter.event,
    onDidEnable: onDidEnableEmitter.event,
    onDidDisable: onDidDisableEmitter.event,
    onDidMarketPackageEvent: onDidMarketPackageEventEmitter.event,
    listInstalled: vi.fn().mockResolvedValue([]),
    isInstalled: vi.fn().mockReturnValue(false),
    ensureFull: vi.fn().mockResolvedValue({ success: true }),
    cancelInstall: vi.fn().mockReturnValue(true),
    registerInstallTarget: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    getRegisteredInstallTargetTypes: vi
      .fn()
      .mockReturnValue(['media', 'starter', 'preset', 'bundle']),
    getMissingInstallTargetContributor: vi.fn(),
  } as unknown as MarketplaceService;
}

// =============================================================================
// Tests
// =============================================================================

describe('NekoMarketAPIImpl', () => {
  let service: MarketplaceService;
  let api: NekoMarketAPI;

  beforeEach(() => {
    service = createMockService();
    api = new NekoMarketAPIImpl(service);
  });

  describe('getInstalled', () => {
    it('returns all packages when no options', async () => {
      const packages = [
        { packageId: 'a', type: 'shader', enabled: true },
        { packageId: 'b', type: 'skill', enabled: false },
      ];
      vi.mocked(service.listInstalled).mockResolvedValue(packages as never);

      const result = await api.getInstalled();
      expect(result).toHaveLength(2);
    });

    it('filters by types', async () => {
      const packages = [
        { packageId: 'a', type: 'shader', enabled: true },
        { packageId: 'b', type: 'skill', enabled: true },
        { packageId: 'c', type: 'preset', enabled: true },
      ];
      vi.mocked(service.listInstalled).mockResolvedValue(packages as never);

      const result = await api.getInstalled({ types: ['shader', 'preset'] });
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.packageId)).toEqual(['a', 'c']);
    });

    it('filters by enabledOnly', async () => {
      const packages = [
        { packageId: 'a', type: 'shader', enabled: true },
        { packageId: 'b', type: 'shader', enabled: false },
      ];
      vi.mocked(service.listInstalled).mockResolvedValue(packages as never);

      const result = await api.getInstalled({ enabledOnly: true });
      expect(result).toHaveLength(1);
      expect(result[0]!.packageId).toBe('a');
    });

    it('combines type and enabledOnly filters', async () => {
      const packages = [
        { packageId: 'a', type: 'shader', enabled: true },
        { packageId: 'b', type: 'shader', enabled: false },
        { packageId: 'c', type: 'skill', enabled: true },
      ];
      vi.mocked(service.listInstalled).mockResolvedValue(packages as never);

      const result = await api.getInstalled({ types: ['shader'], enabledOnly: true });
      expect(result).toHaveLength(1);
      expect(result[0]!.packageId).toBe('a');
    });
  });

  describe('isInstalled', () => {
    it('delegates to service', () => {
      vi.mocked(service.isInstalled).mockReturnValue(true);

      expect(api.isInstalled('test-pkg')).toBe(true);
      expect(service.isInstalled).toHaveBeenCalledWith('test-pkg');
    });
  });

  describe('ensureFull', () => {
    it('delegates full-quality asset requests to service', async () => {
      vi.mocked(service.ensureFull).mockResolvedValue({
        success: true,
        installedPath: '/tmp/full',
      });

      await expect(api.ensureFull('@studio/model', 'weights-fp16')).resolves.toEqual({
        success: true,
        installedPath: '/tmp/full',
      });
      expect(service.ensureFull).toHaveBeenCalledWith('@studio/model', 'weights-fp16');
    });
  });

  describe('cancelInstall', () => {
    it('delegates download cancellation to service', () => {
      expect(api.cancelInstall('@studio/model')).toBe(true);
      expect(service.cancelInstall).toHaveBeenCalledWith('@studio/model');
    });
  });

  describe('registerInstallTarget', () => {
    it('delegates target registration to service', () => {
      const target = {
        type: 'skill' as const,
        getInstallPath: vi.fn(),
      };

      const disposable = api.registerInstallTarget(target);

      expect(service.registerInstallTarget).toHaveBeenCalledWith(target, undefined, undefined);
      expect(disposable).toHaveProperty('dispose');
    });

    it('exposes registered target types from service', () => {
      expect(api.getRegisteredInstallTargetTypes()).toEqual([
        'media',
        'starter',
        'preset',
        'bundle',
      ]);
    });

    it('exposes missing contributor state from service', () => {
      const manifest = {
        id: '@test/model',
        name: 'model',
        version: '1.0.0',
        type: 'model',
        source: { kind: 'local', path: '/tmp/model' },
        distributionKind: 'archive',
        createdAt: 1,
        updatedAt: 1,
      } as never;
      vi.mocked(service.getMissingInstallTargetContributor).mockReturnValue({
        type: 'model',
        reason: 'not-declared',
        message: 'No InstallTarget contribution for type: model',
      });

      expect(api.getMissingInstallTargetContributor(manifest)).toMatchObject({
        type: 'model',
        reason: 'not-declared',
      });
    });
  });

  describe('events', () => {
    it('exposes onDidInstall from service', () => {
      expect(api.onDidInstall).toBe(service.onDidInstall);
    });

    it('exposes onDidUninstall from service', () => {
      expect(api.onDidUninstall).toBe(service.onDidUninstall);
    });

    it('exposes onDidEnable from service', () => {
      expect(api.onDidEnable).toBe(service.onDidEnable);
    });

    it('exposes onDidDisable from service', () => {
      expect(api.onDidDisable).toBe(service.onDidDisable);
    });

    it('exposes typed market package event stream from service', () => {
      expect(api.onDidMarketPackageEvent).toBe(service.onDidMarketPackageEvent);
    });
  });

  describe('dispose', () => {
    it('does not throw', () => {
      expect(() => (api as NekoMarketAPIImpl).dispose()).not.toThrow();
    });
  });
});
