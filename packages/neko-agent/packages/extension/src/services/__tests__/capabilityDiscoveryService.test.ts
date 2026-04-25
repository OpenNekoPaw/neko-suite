import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolCategoryRegistry, ToolGroupRegistry, ToolRegistry } from '@neko/agent';
import type { AgentCapabilityProvider, Skill, Tool } from '@neko/shared';
import { CapabilityDiscoveryService } from '../capabilityDiscoveryService';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));
const capabilityLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../base', () => ({
  getRootLogger: () => ({
    child: () => capabilityLogger,
  }),
}));

function createTool(overrides: Partial<Tool> & Pick<Tool, 'name' | 'category'>): Tool {
  return {
    name: overrides.name,
    description: overrides.description ?? `${overrides.name} description`,
    category: overrides.category,
    parameters: overrides.parameters ?? { type: 'object', properties: {} },
    execute:
      overrides.execute ??
      (async () => ({
        success: true,
      })),
    ...(overrides.requiresConfirmation !== undefined
      ? { requiresConfirmation: overrides.requiresConfirmation }
      : {}),
  };
}

function createProvider(config: {
  id?: string;
  version?: string;
  tools: Tool[];
  skills?: Skill[];
  toolGroups?: ReturnType<ToolGroupRegistry['list']>;
}): AgentCapabilityProvider {
  return {
    id: config.id ?? 'neko.test',
    version: config.version ?? '1.0.0',
    getTools: () => config.tools,
    ...(config.skills ? { getSkills: () => config.skills } : {}),
    ...(config.toolGroups ? { getToolGroups: () => config.toolGroups } : {}),
  };
}

describe('CapabilityDiscoveryService', () => {
  let toolRegistry: ToolRegistry;
  let toolGroupRegistry: ToolGroupRegistry;
  let toolCategoryRegistry: ToolCategoryRegistry;
  let service: CapabilityDiscoveryService;

  beforeEach(() => {
    capabilityLogger.info.mockReset();
    capabilityLogger.warn.mockReset();
    capabilityLogger.debug.mockReset();
    toolRegistry = new ToolRegistry();
    toolGroupRegistry = new ToolGroupRegistry();
    toolCategoryRegistry = new ToolCategoryRegistry();
    service = new CapabilityDiscoveryService({
      toolRegistry,
      toolGroupRegistry,
      toolCategoryRegistry,
    });
  });

  it('registerProvider 后应该按 ToolGroup tier 分类到共享 ToolCategoryRegistry', () => {
    const tool = createTool({ name: 'RenderTimeline', category: 'media' });
    const provider = createProvider({
      id: 'neko.cut',
      tools: [tool],
      toolGroups: [
        {
          name: 'timeline-render',
          description: 'Render tools',
          tools: ['RenderTimeline'],
          enabled: true,
          source: 'builtin',
          loadingTier: 'resident',
        },
      ],
    });

    service.registerProvider(provider, { extensionContext: {} });

    expect(toolRegistry.get('RenderTimeline')).toBe(tool);
    expect(toolCategoryRegistry.getToolInfo('RenderTimeline')).toEqual(
      expect.objectContaining({
        name: 'RenderTimeline',
        category: 'media',
        layer: 'always',
      }),
    );
  });

  it('unregisterProvider 后应该清掉已移除工具的分类投影', () => {
    const tool = createTool({ name: 'AnalyzeStoryboard', category: 'analysis' });
    const provider = createProvider({
      id: 'neko.story',
      tools: [tool],
      toolGroups: [
        {
          name: 'story-analysis',
          description: 'Storyboard analysis',
          tools: ['AnalyzeStoryboard'],
          enabled: true,
          source: 'builtin',
          loadingTier: 'eager',
        },
      ],
    });

    service.registerProvider(provider, { extensionContext: {} });
    service.unregisterProvider('neko.story');

    expect(toolRegistry.get('AnalyzeStoryboard')).toBeUndefined();
    expect(toolGroupRegistry.get('story-analysis')).toBeUndefined();
    expect(toolCategoryRegistry.getToolInfo('AnalyzeStoryboard')).toBeUndefined();
  });

  it('syncToolCategories 支持把当前能力状态重建到外部传入的 registry', () => {
    const generationTool = createTool({ name: 'GenerateShot', category: 'generation' });
    const fileTool = createTool({ name: 'ReviewScript', category: 'document' });
    toolRegistry.register(generationTool);
    toolRegistry.register(fileTool);
    toolGroupRegistry.register({
      name: 'review-tools',
      description: 'Script review tools',
      tools: ['ReviewScript'],
      enabled: true,
      source: 'builtin',
      loadingTier: 'lazy',
    });

    const externalRegistry = new ToolCategoryRegistry();
    service.syncToolCategories(externalRegistry);

    expect(externalRegistry.getToolInfo('GenerateShot')).toEqual(
      expect.objectContaining({
        category: 'generation',
        layer: 'dynamic',
      }),
    );
    expect(externalRegistry.getToolInfo('ReviewScript')).toEqual(
      expect.objectContaining({
        category: 'document',
        layer: 'dynamic',
      }),
    );
  });

  it('在 provider 之间出现同名 tool/skill/toolGroup 时输出结构化告警', () => {
    service = new CapabilityDiscoveryService({
      toolRegistry,
      skillRegistry: {
        registerSkill: vi.fn((skill: Skill) => undefined),
        unregisterSkill: vi.fn(),
        getSkill: vi.fn((name: string) => (name === 'story-mode' ? { name } : undefined)),
        listSkills: vi.fn(() => []),
        listAllSkills: vi.fn(() => []),
        getSkillByCommand: vi.fn(),
        searchSkills: vi.fn(() => []),
        skillCount: 0,
        clear: vi.fn(),
      },
      toolGroupRegistry,
      toolCategoryRegistry,
    });

    service.registerProvider(
      createProvider({
        id: 'neko.cut',
        tools: [createTool({ name: 'RenderTimeline', category: 'media' })],
        skills: [{ name: 'story-mode', description: 'a', content: '', enabled: true }],
        toolGroups: [
          {
            name: 'timeline-render',
            description: 'Render tools',
            tools: ['RenderTimeline'],
            enabled: true,
            source: 'builtin',
            loadingTier: 'resident',
          },
        ],
      }),
      { extensionContext: {} },
    );

    service.registerProvider(
      createProvider({
        id: 'neko.story',
        tools: [createTool({ name: 'RenderTimeline', category: 'media' })],
        skills: [{ name: 'story-mode', description: 'b', content: '', enabled: true }],
        toolGroups: [
          {
            name: 'timeline-render',
            description: 'Other render tools',
            tools: ['RenderTimeline'],
            enabled: true,
            source: 'builtin',
            loadingTier: 'resident',
          },
        ],
      }),
      { extensionContext: {} },
    );

    expect(capabilityLogger.warn).toHaveBeenCalledWith(
      'Capability registration is overwriting a shared runtime name.',
      expect.objectContaining({
        code: 'extension.capability.tool.name-collision',
        reason: 'provider-name-collision',
      }),
    );
    expect(capabilityLogger.warn).toHaveBeenCalledWith(
      'Capability registration is overwriting a shared runtime name.',
      expect.objectContaining({
        code: 'extension.capability.skill.name-collision',
        reason: 'provider-name-collision',
      }),
    );
    expect(capabilityLogger.warn).toHaveBeenCalledWith(
      'Capability registration is overwriting a shared runtime name.',
      expect.objectContaining({
        code: 'extension.capability.tool-group.name-collision',
        reason: 'provider-name-collision',
      }),
    );
  });

  it('在 capability context 缺失时返回空 promptFragments 并输出一次告警', () => {
    const fragments = service.getAllPromptFragments();

    expect(fragments).toEqual([]);
    expect(capabilityLogger.warn).toHaveBeenCalledWith(
      'Skipping capability prompt fragment aggregation because capability context is not initialized.',
      expect.objectContaining({
        code: 'extension.capability.prompt-fragments-skipped',
        reason: 'missing-capability-context',
      }),
    );

    capabilityLogger.warn.mockClear();
    expect(service.getAllPromptFragments()).toEqual([]);
    expect(capabilityLogger.warn).not.toHaveBeenCalled();
  });
});
