import { describe, expect, it, vi } from 'vitest';
import type { InstallProgress } from '@neko/shared';
import {
  SKILL_MARKET_UNAVAILABLE_ERROR,
  executeSkillMarketRequest,
  type SkillMarketRuntime,
} from '../skill-market-request';

function createMarket(overrides: Partial<SkillMarketRuntime> = {}): SkillMarketRuntime {
  return {
    search: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
    install: vi.fn(async () => ({ success: true, installedPath: '/tmp/skill' })),
    uninstall: vi.fn(async () => undefined),
    listInstalled: vi.fn(async () => []),
    checkUpdates: vi.fn(async () => []),
    getFeatured: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
    ...overrides,
  };
}

describe('executeSkillMarketRequest', () => {
  it('normalizes webview search query before calling the skill market runtime', async () => {
    const market = createMarket();

    await executeSkillMarketRequest({
      market,
      request: {
        kind: 'search',
        query: { text: 'camera', tags: ['shot'], types: ['skill'] },
      },
    });

    expect(market.search).toHaveBeenCalledWith({ text: 'camera', tags: ['shot'] });
  });

  it('emits install progress and final install result through one runtime path', async () => {
    const progress: InstallProgress = {
      packageId: '@pub/camera-shot',
      phase: 'done',
      percent: 100,
    };
    const market = createMarket({
      install: vi.fn(async (_packageId, _version, onProgress) => {
        onProgress?.(progress);
        return { success: true, installedPath: '/tmp/skill' };
      }),
    });
    const onEvent = vi.fn();

    const events = await executeSkillMarketRequest({
      market,
      request: { kind: 'install', packageId: '@pub/camera-shot', version: '1.0.0' },
      onEvent,
    });

    expect(events).toEqual([
      { kind: 'installProgress', data: progress },
      { kind: 'installResult', data: { success: true, installedPath: '/tmp/skill' } },
    ]);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('returns a standardized error when skill marketplace is unavailable', async () => {
    await expect(
      executeSkillMarketRequest({
        market: null,
        request: { kind: 'listInstalled' },
      }),
    ).resolves.toEqual([{ kind: 'error', error: SKILL_MARKET_UNAVAILABLE_ERROR }]);
  });
});
