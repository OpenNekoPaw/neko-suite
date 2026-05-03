import { describe, expect, it, vi } from 'vitest';
import type { InstallProgress } from '@neko/shared';
import { ConfigBridge } from '../configBridge';

const resolveNekoMarketRuntime = vi.hoisted(() => vi.fn());

vi.mock('../marketBridge', () => ({
  resolveNekoMarketRuntime,
}));

describe('ConfigBridge marketplace routing', () => {
  it('routes market search to neko-market runtime and posts the result', async () => {
    const result = { items: [], total: 0, hasMore: false };
    const market = {
      search: vi.fn(async () => result),
    };
    resolveNekoMarketRuntime.mockResolvedValue(market);
    const bridge = createBridge(undefined);
    const postMessage = vi.fn<(message: Record<string, unknown>) => void>();

    await bridge.handleMessage({ type: 'market:search', query: { text: 'camera' } }, postMessage);

    expect(market.search).toHaveBeenCalledWith({ text: 'camera' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'market:searchResult', data: result });
  });

  it('routes install progress and final result without a global progress listener', async () => {
    const progress: InstallProgress = {
      packageId: '@pub/camera-shot',
      phase: 'done',
      percent: 100,
    };
    const installResult = { success: true, installedPath: '/tmp/skill' };
    const market = {
      install: vi.fn(
        async (
          _packageId: string,
          _version: string,
          onProgress?: (progress: InstallProgress) => void,
        ) => {
          onProgress?.(progress);
          return installResult;
        },
      ),
    };
    resolveNekoMarketRuntime.mockResolvedValue(market);
    const bridge = createBridge(undefined);
    const postMessage = vi.fn<(message: Record<string, unknown>) => void>();

    await bridge.handleMessage(
      { type: 'market:install', packageId: '@pub/camera-shot', version: '1.0.0' },
      postMessage,
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:installProgress',
      data: progress,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:installResult',
      data: installResult,
    });
  });

  it('falls back to platform skillMarket when neko-market extension is unavailable', async () => {
    const result = { items: [], total: 0, hasMore: false };
    const skillMarket = {
      search: vi.fn(async () => result),
    };
    resolveNekoMarketRuntime.mockResolvedValue(null);
    const bridge = createBridge(skillMarket);
    const postMessage = vi.fn<(message: Record<string, unknown>) => void>();

    await bridge.handleMessage({ type: 'market:search', query: { text: 'camera' } }, postMessage);

    expect(skillMarket.search).toHaveBeenCalledWith({ text: 'camera' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'market:searchResult', data: result });
  });

  it('reports market error when neither neko-market nor platform skillMarket is configured', async () => {
    resolveNekoMarketRuntime.mockResolvedValue(null);
    const bridge = createBridge(undefined);
    const postMessage = vi.fn<(message: Record<string, unknown>) => void>();

    await bridge.handleMessage({ type: 'market:listInstalled' }, postMessage);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'market:error',
      error: 'Skill marketplace is not configured.',
    });
  });
});

function createBridge(skillMarket: unknown): ConfigBridge {
  const bridge = Object.create(ConfigBridge.prototype) as ConfigBridge;
  Object.defineProperty(bridge, 'platform', {
    value: { skillMarket },
  });
  return bridge;
}
