import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { NEKO_MARKET_EXTENSION_ID } from '@neko-agent/types';
import { resolveNekoMarketRuntime } from '../marketBridge';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('resolveNekoMarketRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adapts neko-market extension API into a skill market runtime', async () => {
    const api = {
      search: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
      install: vi.fn(async () => ({ success: true, installedPath: '/tmp/skill' })),
      uninstall: vi.fn(async () => undefined),
      getInstalled: vi.fn(async () => [
        { packageId: '@pub/skill-a', type: 'skill' },
        { packageId: '@pub/shader-a', type: 'shader' },
      ]),
      checkUpdates: vi.fn(async () => [
        { packageId: '@pub/skill-a', currentVersion: '1.0.0', latestVersion: '1.1.0' },
        { packageId: '@pub/shader-a', currentVersion: '1.0.0', latestVersion: '1.1.0' },
      ]),
      getFeatured: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
    };
    const activate = vi.fn(async () => api);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: false,
      activate,
      exports: api,
    } as never);

    const runtime = await resolveNekoMarketRuntime();
    expect(vscode.extensions.getExtension).toHaveBeenCalledWith(NEKO_MARKET_EXTENSION_ID);
    expect(activate).toHaveBeenCalledTimes(1);

    await runtime?.search({ text: 'camera' });
    expect(api.search).toHaveBeenCalledWith({ text: 'camera', types: ['skill'] });

    await expect(runtime?.listInstalled()).resolves.toEqual([
      { packageId: '@pub/skill-a', type: 'skill' },
    ]);
    await expect(runtime?.checkUpdates()).resolves.toEqual([
      { packageId: '@pub/skill-a', currentVersion: '1.0.0', latestVersion: '1.1.0' },
    ]);
    await runtime?.getFeatured();
    expect(api.getFeatured).toHaveBeenCalledWith('skill');
  });

  it('returns null when neko-market extension is unavailable', async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);

    await expect(resolveNekoMarketRuntime()).resolves.toBeNull();
  });
});
