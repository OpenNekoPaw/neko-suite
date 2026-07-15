import { describe, expect, it, vi } from 'vitest';
import type {
  AgentCapabilityProvider,
  ArtifactProfileDescriptor,
  PromptFragment,
  ProviderCard,
  Skill,
  Tool,
} from '@neko/shared';
import { ToolRegistry } from '../../tools';
import {
  ArtifactProfileRegistry,
  ProviderExpressionProfileRegistry,
  composeAgentProfiles,
} from '../../profile';
import { CapabilityRegistryRuntime } from '../capability/capability-registry-runtime';

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

  it('passes the registered capability context when aggregating provider skills', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(
      {
        ...createProvider('neko.canvas', []),
        getSkills: (context?: { readonly locale?: string }) => [
          {
            ...createSkill('canvas-storyboard'),
            description: context?.locale === 'zh' ? '画布分镜' : 'Canvas storyboard',
          },
        ],
      },
      { extensionContext: {}, locale: 'zh' },
    );

    expect(runtime.getAllSkills()[0]?.description).toBe('画布分镜');
  });

  it('projects localized provider prompt fragments from the registered capability context', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const fragment = {
      id: 'neko.canvas:markdown',
      content: 'Canvas Markdown guidance.',
      locales: {
        zh: {
          content: 'Canvas Markdown 中文指导。',
        },
      },
    } satisfies PromptFragment & {
      readonly locales: {
        readonly zh: {
          readonly content: string;
        };
      };
    };

    runtime.registerProvider(
      {
        ...createProvider('neko.canvas', []),
        getPromptFragments: () => [fragment],
      },
      { extensionContext: {}, locale: 'zh' },
    );

    expect(runtime.getAllPromptFragments()).toEqual([
      expect.objectContaining({
        id: 'neko.canvas:markdown',
        content: 'Canvas Markdown 中文指导。',
      }),
    ]);
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

  it('registers profile contributions through canonical profile registries', () => {
    const toolRegistry = new ToolRegistry();
    const artifactProfileRegistry = new ArtifactProfileRegistry();
    const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();
    const runtime = new CapabilityRegistryRuntime({
      toolRegistry,
      artifactProfileRegistry,
      providerExpressionProfileRegistry,
    });
    const artifactProfile: ArtifactProfileDescriptor = {
      profileId: 'studio.shot-review',
      kind: 'artifact',
      protocol: 'GenericTable',
      version: 1,
      source: 'package',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
    };
    const providerCard: ProviderCard = {
      providerId: 'flux',
      displayName: 'Flux',
      version: '1.0.0',
      capabilities: ['image.generate'],
      sourceLayer: 'builtin',
      syntaxProfile: { notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
    };

    runtime.registerProvider(
      {
        ...createProvider('neko.profiles', []),
        getArtifactProfiles: () => [artifactProfile],
        getProviderCards: () => [providerCard],
      },
      { extensionContext: {} },
    );

    expect(artifactProfileRegistry.get('studio.shot-review', 1)).toEqual(artifactProfile);
    expect(providerExpressionProfileRegistry.get('provider-expression:flux', '1.0.0')).toEqual(
      expect.objectContaining({
        profileId: 'provider-expression:flux',
        kind: 'provider-expression',
        source: 'builtin',
      }),
    );

    runtime.unregisterProvider('neko.profiles');

    expect(artifactProfileRegistry.get('studio.shot-review', 1)).toBeUndefined();
    expect(
      providerExpressionProfileRegistry.get('provider-expression:flux', '1.0.0'),
    ).toBeUndefined();
  });

  it('lets a provider ship a Skill and profile in the same package while resolving by id', () => {
    const toolRegistry = new ToolRegistry();
    const artifactProfileRegistry = new ArtifactProfileRegistry();
    const runtime = new CapabilityRegistryRuntime({
      toolRegistry,
      artifactProfileRegistry,
    });
    const profile: ArtifactProfileDescriptor = {
      profileId: 'studio.same-package-table',
      kind: 'artifact',
      protocol: 'GenericTable',
      version: 1,
      source: 'package',
      columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
    };
    const skill: Skill = {
      ...createSkill('same-package-skill'),
      profileReferences: [
        {
          profileId: 'studio.same-package-table',
          kind: 'artifact',
          relationship: 'produces',
        },
      ],
    };

    runtime.registerProvider(
      {
        ...createProvider('neko.same-package', []),
        getSkills: () => [skill],
        getArtifactProfiles: () => [profile],
      },
      { extensionContext: {} },
    );

    const composition = composeAgentProfiles({
      skill: runtime.getAllSkills()[0],
      artifactProfileRegistry,
    });

    expect(composition.artifactProfiles).toEqual([profile]);
    expect(composition.diagnostics).toEqual([]);
  });
});
