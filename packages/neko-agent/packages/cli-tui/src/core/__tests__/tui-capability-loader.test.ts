import { describe, expect, it, vi } from 'vitest';
import {
  ArtifactProfileRegistry,
  CreationProfileRegistry,
  ProviderCardRegistry,
  ProviderExpressionProfileRegistry,
  SkillRegistry,
  ToolGroupRegistry,
  ToolRegistry,
} from '@neko/agent';
import type {
  AgentCapabilityProvider,
  ArtifactProfileDescriptor,
  CreationProfileDescriptor,
  AgentReferenceContributor,
  PromptFragment,
  ProviderCard,
  ProviderExpressionProfileDescriptor,
  Skill,
  Tool,
  ToolGroup,
} from '@neko/shared';
import { createTuiCapabilityLoader } from '../tui-capability-loader';

function createTool(name: string, extra: Partial<Tool> = {}): Tool {
  return {
    name,
    description: `${name} tool`,
    category: 'system',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(async () => ({ success: true })),
    ...extra,
  };
}

function createProvider(
  overrides: Partial<AgentCapabilityProvider> & Pick<AgentCapabilityProvider, 'id'>,
): AgentCapabilityProvider {
  return {
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }],
    getTools: () => [],
    ...overrides,
  };
}

function createLoader(toolRegistry = new ToolRegistry()) {
  const skillRegistry = new SkillRegistry();
  const toolGroupRegistry = new ToolGroupRegistry();
  const providerCardRegistry = new ProviderCardRegistry();
  const artifactProfileRegistry = new ArtifactProfileRegistry();
  const creationProfileRegistry = new CreationProfileRegistry();
  const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();
  return {
    toolRegistry,
    skillRegistry,
    toolGroupRegistry,
    providerCardRegistry,
    artifactProfileRegistry,
    creationProfileRegistry,
    providerExpressionProfileRegistry,
    loader: createTuiCapabilityLoader({
      toolRegistry,
      skillRegistry,
      toolGroupRegistry,
      providerCardRegistry,
      artifactProfileRegistry,
      creationProfileRegistry,
      providerExpressionProfileRegistry,
    }),
  };
}

function createLocalizedLoader(toolRegistry = new ToolRegistry()) {
  const skillRegistry = new SkillRegistry();
  const toolGroupRegistry = new ToolGroupRegistry();
  const providerCardRegistry = new ProviderCardRegistry();
  const artifactProfileRegistry = new ArtifactProfileRegistry();
  const creationProfileRegistry = new CreationProfileRegistry();
  const providerExpressionProfileRegistry = new ProviderExpressionProfileRegistry();
  return {
    toolRegistry,
    skillRegistry,
    toolGroupRegistry,
    providerCardRegistry,
    artifactProfileRegistry,
    creationProfileRegistry,
    providerExpressionProfileRegistry,
    loader: createTuiCapabilityLoader({
      toolRegistry,
      skillRegistry,
      toolGroupRegistry,
      providerCardRegistry,
      artifactProfileRegistry,
      creationProfileRegistry,
      providerExpressionProfileRegistry,
      locale: 'zh',
    }),
  };
}

describe('createTuiCapabilityLoader', () => {
  it('registers providers that explicitly support TUI', () => {
    const { loader, toolRegistry } = createLoader();
    const provider = createProvider({
      id: 'neko-assets',
      getTools: () => [createTool('assets.list')],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('assets.list')).toBeDefined();
    expect(result.providers[0]).toMatchObject({
      providerId: 'neko-assets',
      loaded: [{ kind: 'tool', name: 'assets.list' }],
      skipped: [],
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('passes locale to provider skills before registration', () => {
    const { loader, skillRegistry } = createLocalizedLoader();
    const provider = createProvider({
      id: 'localized-skills',
      getSkills: (context) => [
        {
          name: 'localized-skill',
          description: context?.locale === 'zh' ? '中文技能' : 'English skill',
          content: 'body',
          source: 'builtin',
          enabled: true,
        },
      ],
    });

    const result = loader.registerProviders([provider]);

    expect(result.providers[0]?.loaded).toEqual([{ kind: 'skill', name: 'localized-skill' }]);
    expect(skillRegistry.getSkill('localized-skill')?.description).toBe('中文技能');
  });

  it('projects localized provider prompt fragments from the TUI locale', () => {
    const { loader } = createLocalizedLoader();
    const provider = createProvider({
      id: 'localized-fragments',
      getPromptFragments: () => [
        {
          id: 'provider:guide',
          content: 'English provider guide.',
          locales: {
            zh: {
              content: '中文 Provider 指导。',
            },
          },
        },
      ],
    });

    const result = loader.registerProviders([provider]);

    expect(result.promptFragments).toEqual([
      expect.objectContaining({
        id: 'provider:guide',
        content: '中文 Provider 指导。',
      }),
    ]);
  });

  it('skips legacy providers that do not opt into TUI', () => {
    const { loader, toolRegistry } = createLoader();
    const provider = createProvider({
      id: 'neko-cut',
      hostRequirements: undefined,
      getTools: () => [createTool('cut.revealTimeline')],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('cut.revealTimeline')).toBeUndefined();
    expect(result.providers[0]?.loaded).toEqual([]);
    expect(result.providers[0]?.skipped[0]).toMatchObject({
      providerId: 'neko-cut',
      contributionKind: 'provider',
      reason: 'host-not-supported',
      host: 'tui',
    });
  });

  it('skips tools requiring VSCode while loading safe tools from the same provider', () => {
    const { loader, toolRegistry } = createLoader();
    const provider = createProvider({
      id: 'mixed',
      getTools: () => [
        createTool('safe.query', { isReadOnly: true }),
        createTool('editor.reveal', {
          metadata: {
            requirements: { vscode: true },
          },
        } as Partial<Tool>),
      ],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('safe.query')).toBeDefined();
    expect(toolRegistry.get('editor.reveal')).toBeUndefined();
    expect(result.providers[0]?.loaded).toEqual([{ kind: 'tool', name: 'safe.query' }]);
    expect(result.providers[0]?.skipped[0]).toMatchObject({
      contributionKind: 'tool',
      contributionName: 'editor.reveal',
      reason: 'requires-vscode',
      requirement: 'vscode',
    });
  });

  it('aggregates prompt fragments and terminal-safe reference contributors', () => {
    const { loader } = createLoader();
    const fragment: PromptFragment = {
      id: 'neko-assets:references',
      content: 'Use asset IDs when referring to library items.',
      priority: 80,
    };
    const contributor: AgentReferenceContributor = {
      id: 'neko-assets',
      displayName: 'Assets',
      search: async () => ({ candidates: [], diagnostics: [] }),
    };
    const provider = createProvider({
      id: 'neko-assets',
      getPromptFragments: () => [fragment],
      getReferenceContributors: () => [contributor],
    });

    const result = loader.registerProviders([provider]);

    expect(result.promptFragments).toEqual([fragment]);
    expect(result.referenceContributors).toEqual([contributor]);
    expect(result.providers[0]?.loaded).toEqual([
      { kind: 'promptFragment', name: 'neko-assets:references' },
      { kind: 'referenceContributor', name: 'neko-assets' },
    ]);
  });

  it('skips providers whose runtime requirements need VSCode', () => {
    const { loader, toolRegistry } = createLoader();
    const provider = createProvider({
      id: 'vscode-provider',
      requirements: { vscode: true },
      getTools: () => [createTool('vscode.only')],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('vscode.only')).toBeUndefined();
    expect(result.providers[0]?.skipped[0]).toMatchObject({
      providerId: 'vscode-provider',
      contributionKind: 'provider',
      reason: 'requires-vscode',
      requirement: 'vscode',
    });
  });

  it('filters non-tool contributions before registering them into shared runtime registries', () => {
    const { loader, skillRegistry, toolGroupRegistry, providerCardRegistry } = createLoader();
    const safeSkill: Skill = {
      name: 'safe-skill',
      description: 'Terminal-safe skill',
      content: 'Use terminal-safe tools.',
      source: 'builtin',
      enabled: true,
    };
    const vscodeSkill = {
      name: 'vscode-skill',
      description: 'VSCode skill',
      content: 'Requires active editor.',
      source: 'builtin',
      enabled: true,
      metadata: { requirements: { vscode: true } },
    } satisfies Skill & {
      readonly metadata: { readonly requirements: { readonly vscode: true } };
    };
    const safeGroup: ToolGroup = {
      name: 'safe-tools',
      description: 'Safe tools',
      tools: ['safe.query'],
      source: 'builtin',
      enabled: true,
    };
    const vscodeGroup = {
      name: 'vscode-tools',
      description: 'VSCode tools',
      tools: ['editor.reveal'],
      source: 'builtin',
      enabled: true,
      metadata: { requirements: { vscode: true } },
    } satisfies ToolGroup & {
      readonly metadata: { readonly requirements: { readonly vscode: true } };
    };
    const safeCard: ProviderCard = {
      providerId: 'safe-provider',
      displayName: 'Safe Provider',
      version: '1.0.0',
      capabilities: ['image.generate'],
      sourceLayer: 'builtin',
      syntaxProfile: { notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: {}, antiBiasStrategies: [] },
    };
    const vscodeCard = {
      providerId: 'vscode-provider',
      displayName: 'VSCode Provider',
      version: '1.0.0',
      capabilities: ['image.generate'],
      sourceLayer: 'builtin',
      syntaxProfile: { notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: {}, antiBiasStrategies: [] },
      requirements: { vscode: true },
    } satisfies ProviderCard & { readonly requirements: { readonly vscode: true } };
    const provider = createProvider({
      id: 'mixed-non-tools',
      getSkills: () => [safeSkill, vscodeSkill],
      getToolGroups: () => [safeGroup, vscodeGroup],
      getProviderCards: () => [safeCard, vscodeCard],
    });

    const result = loader.registerProviders([provider]);

    expect(skillRegistry.getSkill('safe-skill')).toBe(safeSkill);
    expect(skillRegistry.getSkill('vscode-skill')).toBeUndefined();
    expect(toolGroupRegistry.get('safe-tools')).toBe(safeGroup);
    expect(toolGroupRegistry.get('vscode-tools')).toBeUndefined();
    expect(providerCardRegistry.get('safe-provider')).toEqual(safeCard);
    expect(providerCardRegistry.get('vscode-provider')).toBeUndefined();
    expect(result.providers[0]?.loaded).toEqual([
      { kind: 'skill', name: 'safe-skill' },
      { kind: 'toolGroup', name: 'safe-tools' },
      { kind: 'providerCard', name: 'safe-provider' },
    ]);
    expect(result.providers[0]?.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contributionKind: 'skill', contributionName: 'vscode-skill' }),
        expect.objectContaining({
          contributionKind: 'toolGroup',
          contributionName: 'vscode-tools',
        }),
        expect.objectContaining({
          contributionKind: 'providerCard',
          contributionName: 'vscode-provider',
        }),
      ]),
    );
  });

  it('filters profile contributions before registering them into profile registries', () => {
    const {
      loader,
      artifactProfileRegistry,
      creationProfileRegistry,
      providerExpressionProfileRegistry,
    } = createLoader();
    const artifactProfile = createArtifactProfile('studio.storyboard');
    const vscodeArtifactProfile = {
      ...createArtifactProfile('studio.vscode-storyboard'),
      requirements: { vscode: true },
    } satisfies ArtifactProfileDescriptor & { readonly requirements: { readonly vscode: true } };
    const creationProfile = createCreationProfile('studio.creation');
    const providerExpressionProfile = createProviderExpressionProfile('provider-expression:flux');
    const vscodeExpressionProfile = {
      ...createProviderExpressionProfile('provider-expression:vscode'),
      hostRequirements: [{ host: 'vscode' }],
    } satisfies ProviderExpressionProfileDescriptor & {
      readonly hostRequirements: readonly [{ readonly host: 'vscode' }];
    };
    const provider = createProvider({
      id: 'profile-provider',
      getArtifactProfiles: () => [artifactProfile, vscodeArtifactProfile],
      getCreationProfiles: () => [creationProfile],
      getProviderExpressionProfiles: () => [providerExpressionProfile, vscodeExpressionProfile],
    });

    const result = loader.registerProviders([provider]);

    expect(artifactProfileRegistry.get('studio.storyboard', 1)).toBe(artifactProfile);
    expect(artifactProfileRegistry.get('studio.vscode-storyboard', 1)).toBeUndefined();
    expect(creationProfileRegistry.get('studio.creation', '1.0.0')).toBe(creationProfile);
    expect(providerExpressionProfileRegistry.get('provider-expression:flux', '1.0.0')).toBe(
      providerExpressionProfile,
    );
    expect(providerExpressionProfileRegistry.get('provider-expression:vscode', '1.0.0')).toBeUndefined();
    expect(result.providers[0]?.loaded).toEqual([
      { kind: 'artifactProfile', name: 'studio.storyboard@1' },
      { kind: 'creationProfile', name: 'studio.creation@1.0.0' },
      { kind: 'providerExpressionProfile', name: 'provider-expression:flux@1.0.0' },
    ]);
    expect(result.providers[0]?.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contributionKind: 'artifactProfile',
          contributionName: 'studio.vscode-storyboard@1',
          reason: 'requires-vscode',
        }),
        expect.objectContaining({
          contributionKind: 'providerExpressionProfile',
          contributionName: 'provider-expression:vscode@1.0.0',
          reason: 'host-not-supported',
        }),
      ]),
    );
  });
});

function createArtifactProfile(profileId: string): ArtifactProfileDescriptor {
  return {
    profileId,
    kind: 'artifact',
    protocol: 'GenericTable',
    version: 1,
    source: 'package',
    columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
  };
}

function createCreationProfile(profileId: string): CreationProfileDescriptor {
  return {
    profileId,
    kind: 'creation',
    version: '1.0.0',
    source: 'package',
    defaultStageId: 'draft',
    stages: [{ stageId: 'draft', purpose: 'Draft the requested artifact.' }],
  };
}

function createProviderExpressionProfile(profileId: string): ProviderExpressionProfileDescriptor {
  return {
    profileId,
    kind: 'provider-expression',
    source: 'package',
    providerId: profileId.endsWith('vscode') ? 'vscode-provider' : 'flux',
    displayName: 'Flux',
    version: '1.0.0',
    sourceLayer: 'market',
    capabilities: ['image.generate'],
    syntaxProfile: { notes: [] },
    conceptCoverage: { entries: [] },
    trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
  };
}
