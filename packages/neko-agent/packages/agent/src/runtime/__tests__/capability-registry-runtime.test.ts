import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityProvider, Tool } from '@neko/shared';
import { ToolRegistry } from '../../tools';
import { CapabilityRegistryRuntime } from '../capability-registry-runtime';

function createTool(name: string): Tool {
  return {
    name,
    description: `${name} description`,
    category: 'system',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  };
}

function createProvider(id: string, tools: Tool[]): AgentCapabilityProvider {
  return {
    id,
    version: '1.0.0',
    getTools: () => tools,
  };
}

describe('CapabilityRegistryRuntime', () => {
  it('cleans registered providers that no longer have installed manifests', () => {
    const toolRegistry = new ToolRegistry();
    const disposed = vi.fn();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const installedTool = createTool('InstalledTool');
    const removedTool = createTool('RemovedTool');

    runtime.registerProvider(createProvider('neko.installed', [installedTool]), {
      extensionContext: {},
    });
    runtime.registerProvider(
      {
        ...createProvider('neko.removed', [removedTool]),
        dispose: disposed,
      },
      { extensionContext: {} },
    );
    runtime.replaceManifests([
      {
        id: 'neko.installed',
        version: '1.0.0',
        displayName: 'Installed',
        capabilities: [],
      },
    ]);

    expect(runtime.cleanupProvidersWithoutManifests()).toEqual(['neko.removed']);
    expect(runtime.hasProvider('neko.installed')).toBe(true);
    expect(runtime.hasProvider('neko.removed')).toBe(false);
    expect(toolRegistry.get('InstalledTool')).toBe(installedTool);
    expect(toolRegistry.get('RemovedTool')).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});
