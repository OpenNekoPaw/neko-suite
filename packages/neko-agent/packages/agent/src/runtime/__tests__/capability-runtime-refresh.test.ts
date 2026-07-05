import { describe, expect, it, vi } from 'vitest';
import type { ToolGroup } from '@neko/shared';
import { createCapabilityRuntimeRefreshRuntime } from '../capability/capability-runtime-refresh';
import { ToolGroupRegistry } from '../../skill';

const mediaToolGroup: ToolGroup = {
  name: 'media',
  description: 'Media tools',
  tools: ['media.generateImage'],
  source: 'builtin',
  enabled: true,
  dependencies: ['core'],
};

describe('capability-runtime-refresh', () => {
  function createRegistryWithMediaGroup(): ToolGroupRegistry {
    const registry = new ToolGroupRegistry();
    registry.register(mediaToolGroup);
    return registry;
  }

  it('projects runtime tool groups into the injected tool skill sink', () => {
    const setToolSkills = vi.fn();
    const runtime = createCapabilityRuntimeRefreshRuntime({
      getBindings: () => ({
        toolGroupRegistry: createRegistryWithMediaGroup(),
      }),
      setToolSkills,
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    const toolSkills = runtime.syncToolSkills();

    expect(toolSkills).toEqual([
      expect.objectContaining({
        name: 'media',
        tools: ['media.generateImage'],
        dependencies: ['core'],
      }),
    ]);
    expect(toolSkills[0]?.tools).not.toBe(mediaToolGroup.tools);
    expect(setToolSkills).toHaveBeenCalledWith(toolSkills);
  });

  it('refreshes agent runtime and syncs tool skills when capabilities change', () => {
    const refreshAgentRuntime = vi.fn();
    const setToolSkills = vi.fn();
    const runtime = createCapabilityRuntimeRefreshRuntime({
      getBindings: () => ({
        toolGroupRegistry: createRegistryWithMediaGroup(),
      }),
      refreshAgentRuntime,
      setToolSkills,
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    const result = runtime.handleCapabilityChanged();

    expect(refreshAgentRuntime).toHaveBeenCalledOnce();
    expect(setToolSkills).toHaveBeenCalledOnce();
    expect(result.refreshedAgentRuntime).toBe(true);
    expect(result.toolSkills).toHaveLength(1);
  });

  it('keeps tool skill sync observable even if agent runtime refresh fails', () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const setToolSkills = vi.fn();
    const runtime = createCapabilityRuntimeRefreshRuntime({
      getBindings: () => ({
        toolGroupRegistry: createRegistryWithMediaGroup(),
      }),
      refreshAgentRuntime: () => {
        throw new Error('refresh failed');
      },
      setToolSkills,
      logger,
    });

    const result = runtime.handleCapabilityChanged();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to refresh capability runtime:',
      expect.any(Error),
    );
    expect(setToolSkills).toHaveBeenCalledOnce();
    expect(result.refreshedAgentRuntime).toBe(false);
    expect(result.toolSkills).toHaveLength(1);
  });

  it('warns and skips tool skill sync when ToolGroupRegistry is unavailable', () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const setToolSkills = vi.fn();
    const runtime = createCapabilityRuntimeRefreshRuntime({
      getBindings: () => ({}),
      setToolSkills,
      logger,
    });

    const toolSkills = runtime.syncToolSkills();

    expect(toolSkills).toEqual([]);
    expect(setToolSkills).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'ToolGroupRegistry unavailable; skipping ToolSkills initialization',
    );
  });
});
