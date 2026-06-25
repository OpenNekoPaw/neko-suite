import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES,
  DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
} from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import {
  createStartupGcTargets,
  runResourceCacheStartupGc,
} from '../resourceCacheStartupGcService';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('resource cache startup GC service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 },
    ];
  });

  it('creates project and extension-private resource cache GC targets', () => {
    const targets = createStartupGcTargets(createExtensionContext());

    expect(targets).toEqual([
      {
        scope: 'project',
        cacheRoot: '/mock/workspace/.neko/.cache/resources',
        manifestPath: '/mock/workspace/.neko/.cache/resources/manifest.json',
        projectRoot: '/mock/workspace',
      },
      {
        scope: 'extension-private',
        cacheRoot: '/global/neko-agent/resources',
        manifestPath: '/global/neko-agent/resources/manifest.json',
        extensionPrivateRoot: '/global/neko-agent',
      },
    ]);
  });

  it('runs default quota GC for every startup target', async () => {
    const cache = createResourceCache();

    const results = await runResourceCacheStartupGc({
      context: createExtensionContext(),
      createCacheService: () => cache,
    });

    expect(results).toHaveLength(2);
    expect(cache.gc).toHaveBeenCalledTimes(2);
    expect(cache.gc).toHaveBeenNthCalledWith(1, {
      projectMaxBytes: DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
      globalMaxBytes: DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES,
      preservePinned: true,
      preserveSessionActive: true,
      preserveDebug: true,
      preservePromoted: true,
    });
  });

  it('keeps startup visible but non-blocking when one target fails', async () => {
    const okCache = createResourceCache();
    const failingCache = createResourceCache(new Error('gc failed'));

    const results = await runResourceCacheStartupGc({
      context: createExtensionContext(),
      createCacheService: (target) => (target.scope === 'project' ? failingCache : okCache),
    });

    expect(results).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ scope: 'project' }),
        error: expect.any(Error),
      }),
      expect.objectContaining({
        target: expect.objectContaining({ scope: 'extension-private' }),
        result: expect.objectContaining({ removedCount: 0 }),
      }),
    ]);
  });
});

function createResourceCache(error?: Error): ResourceCacheService {
  return {
    gc: vi.fn(async () => {
      if (error) throw error;
      return {
        removedCount: 0,
        removedBytes: 0,
        skippedCount: 0,
        skippedReasons: {},
      };
    }),
  } as unknown as ResourceCacheService;
}

function createExtensionContext(): vscode.ExtensionContext {
  return {
    extensionUri: vscode.Uri.file('/ext/neko-agent'),
    globalStorageUri: vscode.Uri.file('/global/neko-agent'),
  } as vscode.ExtensionContext;
}
