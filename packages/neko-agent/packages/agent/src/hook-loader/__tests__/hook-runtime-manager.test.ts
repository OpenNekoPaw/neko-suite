import { describe, expect, it, vi } from 'vitest';
import type { ExecutorHooks } from '@neko/shared';
import {
  HookRuntimeManager,
  createProjectHookRuntimeManager,
  type HookRuntimeLoader,
} from '../hook-runtime-manager';
import type { HookLoadError, HookLoadResult, LoadedHook } from '../types';

function createLoadedHook(name: string): LoadedHook {
  return {
    metadata: { name },
    hooks: { name } satisfies ExecutorHooks,
    source: 'project',
    directoryPath: `/repo/.hook/${name}`,
    loadedAt: 1,
  };
}

function createLoader(result: HookLoadResult): HookRuntimeLoader & {
  triggerReload: (hooks: LoadedHook[], errors: HookLoadError[]) => void;
} {
  let onReload: ((hooks: LoadedHook[], errors: HookLoadError[]) => void) | undefined;
  return {
    loadFromDirectory: vi.fn(async () => result),
    watchDirectory: vi.fn((_hookDir, listener) => {
      onReload = listener;
    }),
    clearCache: vi.fn(),
    stopWatching: vi.fn(),
    triggerReload: (hooks, errors) => {
      onReload?.(hooks, errors);
    },
  };
}

describe('HookRuntimeManager', () => {
  it('loads hooks, tracks state, and starts watching the hook directory', async () => {
    const hook = createLoadedHook('audit');
    const loader = createLoader({ hooks: [hook], errors: [] });
    const logger = { debug: vi.fn(), error: vi.fn() };
    const manager = new HookRuntimeManager({
      hookDirectory: '/repo/.hook',
      loader,
      logger,
    });

    await manager.initialize();

    expect(loader.loadFromDirectory).toHaveBeenCalledWith('/repo/.hook');
    expect(loader.watchDirectory).toHaveBeenCalledWith('/repo/.hook', expect.any(Function));
    expect(manager.hasHooks()).toBe(true);
    expect(manager.getHooks()).toEqual([hook.hooks]);
    expect(manager.getLoadedHooks()).toEqual([hook]);
    expect(manager.getErrors()).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith('Loaded 1 hook(s): audit');
  });

  it('updates state and emits reload events from the loader watcher', async () => {
    const initial = createLoadedHook('initial');
    const reloaded = createLoadedHook('reloaded');
    const loader = createLoader({ hooks: [initial], errors: [] });
    const manager = new HookRuntimeManager({
      hookDirectory: '/repo/.hook',
      loader,
    });
    const listener = vi.fn();
    manager.onDidReload(listener);

    await manager.initialize();
    loader.triggerReload([reloaded], []);

    expect(manager.getLoadedHooks()).toEqual([reloaded]);
    expect(listener).toHaveBeenCalledWith({
      hooks: [reloaded],
      errors: [],
    });
  });

  it('reloads by clearing cache and loading the current hook directory', async () => {
    const first = createLoadedHook('first');
    const second = createLoadedHook('second');
    const loader = createLoader({ hooks: [first], errors: [] });
    const loadFromDirectory = vi.mocked(loader.loadFromDirectory);
    loadFromDirectory.mockResolvedValueOnce({ hooks: [first], errors: [] });
    loadFromDirectory.mockResolvedValueOnce({ hooks: [second], errors: [] });
    const manager = new HookRuntimeManager({
      hookDirectory: '/repo/.hook',
      loader,
    });
    const listener = vi.fn();
    manager.onDidReload(listener);

    await manager.initialize();
    await manager.reload();

    expect(loader.clearCache).toHaveBeenCalledOnce();
    expect(manager.getLoadedHooks()).toEqual([second]);
    expect(listener).toHaveBeenCalledWith({
      hooks: [second],
      errors: [],
    });
  });

  it('does not throw initialization errors so host startup can continue', async () => {
    const loader = createLoader({ hooks: [], errors: [] });
    vi.mocked(loader.loadFromDirectory).mockRejectedValueOnce(new Error('read failed'));
    const logger = { debug: vi.fn(), error: vi.fn() };
    const manager = new HookRuntimeManager({
      hookDirectory: '/repo/.hook',
      loader,
      logger,
    });

    await expect(manager.initialize()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith('Failed to initialize:', expect.any(Error));
    expect(loader.watchDirectory).not.toHaveBeenCalled();
  });

  it('creates the project runtime using the injected filesystem, compiler, and path joiner', () => {
    const fs = {
      exists: vi.fn(async () => false),
      readDir: vi.fn(async () => []),
      readFile: vi.fn(async () => ''),
      isDirectory: vi.fn(async () => false),
    };
    const compiler = {
      compile: vi.fn(async () => ({ success: true, code: '' })),
      executeModule: vi.fn(() => ({})),
    };

    const manager = createProjectHookRuntimeManager({
      workspaceRoot: '/repo',
      fs,
      compiler,
      joinPath: (base, child) => `${base}/${child}`,
    });

    expect(manager).toBeInstanceOf(HookRuntimeManager);
  });
});
