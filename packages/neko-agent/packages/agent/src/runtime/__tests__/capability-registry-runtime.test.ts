import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityProvider, Skill, Tool } from '@neko/shared';
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

function createSkill(name: string): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `Use ${name}.`,
    source: 'builtin',
    enabled: true,
  };
}

describe('CapabilityRegistryRuntime', () => {
  it('aggregates skills contributed by registered providers', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(
      {
        ...createProvider('neko.canvas', []),
        getSkills: () => [createSkill('canvas-storyboard')],
      },
      { extensionContext: {} },
    );

    expect(runtime.getAllSkills().map((skill) => skill.name)).toEqual(['canvas-storyboard']);
  });

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

  it('records duplicate provider id diagnostics before replacing the provider', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.duplicate', [createTool('FirstTool')]), {
      extensionContext: {},
    });
    runtime.registerProvider(createProvider('neko.duplicate', [createTool('SecondTool')]), {
      extensionContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.provider.duplicate-id',
          reason: 'duplicate-provider-id',
          context: expect.objectContaining({
            providerId: 'neko.duplicate',
            existingProviderId: 'neko.duplicate',
            conflictingProviderId: 'neko.duplicate',
          }),
        }),
      ]),
    );
    expect(toolRegistry.get('FirstTool')).toBeUndefined();
    expect(toolRegistry.get('SecondTool')).toBeDefined();
  });

  it('records duplicate canonical tool diagnostics with both conflicting providers', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.story', [createTool('GenerateScene')]), {
      extensionContext: {},
    });
    runtime.registerProvider(createProvider('neko.canvas', [createTool('GenerateScene')]), {
      extensionContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.tool.name-collision',
          reason: 'provider-name-collision',
          context: expect.objectContaining({
            capabilityKind: 'tool',
            name: 'GenerateScene',
            providerId: 'neko.canvas',
            existingOwner: 'neko.story',
          }),
        }),
      ]),
    );
  });

  it('records conflicting short names across provider namespaces', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.story', [createTool('story.GenerateScene')]), {
      extensionContext: {},
    });
    runtime.registerProvider(createProvider('neko.canvas', [createTool('canvas.GenerateScene')]), {
      extensionContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.tool.short-name-collision',
          reason: 'conflicting-short-name',
          context: expect.objectContaining({
            name: 'canvas.GenerateScene',
            shortName: 'generatescene',
            providerId: 'neko.canvas',
            existingOwner: 'neko.story',
            existingToolName: 'story.GenerateScene',
          }),
        }),
      ]),
    );
  });
});
