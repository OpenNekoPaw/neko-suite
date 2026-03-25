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
  return { EventEmitter: MockEventEmitter };
});

function createMockService() {
  const vscode = vi.mocked(require('vscode'));
  const { EventEmitter } = vscode;

  const onDidInstallEmitter = new EventEmitter();
  const onDidUninstallEmitter = new EventEmitter();
  const onDidEnableEmitter = new EventEmitter();
  const onDidDisableEmitter = new EventEmitter();

  return {
    onDidInstall: onDidInstallEmitter.event,
    onDidUninstall: onDidUninstallEmitter.event,
    onDidEnable: onDidEnableEmitter.event,
    onDidDisable: onDidDisableEmitter.event,
    listInstalled: vi.fn().mockResolvedValue([]),
    isInstalled: vi.fn().mockReturnValue(false),
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
        { packageId: 'c', type: 'shader-preset', enabled: true },
      ];
      vi.mocked(service.listInstalled).mockResolvedValue(packages as never);

      const result = await api.getInstalled({ types: ['shader', 'shader-preset'] });
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
  });

  describe('dispose', () => {
    it('does not throw', () => {
      expect(() => (api as NekoMarketAPIImpl).dispose()).not.toThrow();
    });
  });
});
