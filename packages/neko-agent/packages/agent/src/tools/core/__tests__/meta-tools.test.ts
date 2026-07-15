import { describe, expect, it, vi } from 'vitest';
import type {
  IToolCategoryRegistry,
  IToolGroupRegistry,
  SkillMediaWorkflowHint,
} from '@neko/shared';
import {
  ActivateSkillTool,
  DeactivateSkillTool,
  CreateSkillTool,
  GetContextTool,
  SetExecutionModeTool,
} from '../meta-tools';
import type { SkillContextSummary } from '../meta-tools';

describe('core meta tools', () => {
  it('awaits asynchronous skill provider state for GetContext', async () => {
    const mediaWorkflow: SkillMediaWorkflowHint = {
      acceptedModalities: ['comic'],
      producedArtifacts: ['StoryboardTable'],
    };
    const mediaSkill: SkillContextSummary = {
      name: 'media-production',
      description: 'Coordinate media workflows',
      domain: 'media',
      relatedSkills: [{ id: 'storyboard', relationship: 'delegator' }],
      mediaWorkflow,
    };
    const tool = new GetContextTool(createCategoryRegistryMock(), createGroupRegistryMock());
    tool.setSkillProvider({
      listSkills: vi.fn(async () => [mediaSkill]),
      getActiveSkill: vi.fn(async () => mediaSkill),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
    });

    await expect(tool.execute({})).resolves.toEqual({
      success: true,
      data: {
        activeSkill: {
          name: 'media-production',
          description: 'Coordinate media workflows',
          domain: 'media',
          relatedSkills: [{ id: 'storyboard', relationship: 'delegator' }],
          mediaWorkflow: {
            acceptedModalities: ['comic'],
            producedArtifacts: ['StoryboardTable'],
          },
        },
        registeredSkills: [
          {
            name: 'media-production',
            description: 'Coordinate media workflows',
            domain: 'media',
            relatedSkills: [{ id: 'storyboard', relationship: 'delegator' }],
            mediaWorkflow: {
              acceptedModalities: ['comic'],
              producedArtifacts: ['StoryboardTable'],
            },
          },
        ],
        toolCategories: [],
        toolCategoryScope: 'registered-inventory-with-current-callable-overlap',
      },
    });
  });

  it('separates registered Tool-group inventory from the current callable Tool list', async () => {
    const categoryRegistry = createCategoryRegistryMock();
    vi.mocked(categoryRegistry.listCategories).mockReturnValue([
      {
        id: 'generation',
        displayName: 'Generation',
        description: 'Generation tools',
        layer: 'domain',
      },
    ] as never);
    vi.mocked(categoryRegistry.getToolsByCategory).mockReturnValue([
      { name: 'GenerateImage' },
    ] as never);
    const groupRegistry = createGroupRegistryMock();
    vi.mocked(groupRegistry.list).mockReturnValue([
      {
        name: 'ai-generation',
        description: 'Registered AI generation inventory',
        enabled: true,
        tools: ['GenerateImage', 'GenerateVideo'],
      },
    ] as never);

    const tool = new GetContextTool(categoryRegistry, groupRegistry, {
      getToolsForTurn: vi.fn(() => ['GenerateImage']),
    } as never);

    await expect(tool.execute({ includeTools: true })).resolves.toEqual({
      success: true,
      data: {
        toolCategories: [
          {
            name: 'ai-generation',
            description: 'Registered AI generation inventory',
            registeredToolCount: 2,
            callableToolCount: 1,
            callableExposure: 'partial',
          },
        ],
        toolCategoryScope: 'registered-inventory-with-current-callable-overlap',
        tools: [{ category: 'Generation', tools: ['GenerateImage'] }],
        toolListScope: 'current-callable',
        toolDiscoveryNotes: [
          'Only names in tools are currently callable. toolCategories is registered inventory and must not be treated as executable support.',
          'registeredToolCount never proves callability. callableToolCount only reports overlap with the current Tool list and does not prove that a specific input, Provider, model, or control is supported.',
          'Provider capability catalogs and lifecycle descriptors are separate from callable tool availability.',
          'If a needed provider tool is absent, inspect registered skills and activate the relevant supplemental skill in referenceSkill when it should not replace the domain skill.',
        ],
      },
    });
  });

  it('reports dynamically injected callable Tools that have no category projection', async () => {
    const categoryRegistry = createCategoryRegistryMock();
    vi.mocked(categoryRegistry.listCategories).mockReturnValue([
      {
        id: 'generation',
        displayName: 'Generation',
        description: 'Generation tools',
        layer: 'domain',
      },
    ] as never);
    const groupRegistry = createGroupRegistryMock();
    vi.mocked(groupRegistry.list).mockReturnValue([
      {
        name: 'ai-generation',
        description: 'Registered AI generation inventory',
        enabled: true,
        tools: ['GenerateImage'],
      },
    ] as never);
    const tool = new GetContextTool(categoryRegistry, groupRegistry, {
      getToolsForTurn: vi.fn(() => ['Read', 'GenerateImage']),
    } as never);

    const result = await tool.execute({ includeTools: true });

    expect(result).toMatchObject({
      success: true,
      data: {
        toolCategories: [
          expect.objectContaining({
            name: 'ai-generation',
            callableToolCount: 1,
            callableExposure: 'all',
          }),
        ],
        tools: [
          { category: 'Generation', tools: [] },
          { category: 'Dynamically injected', tools: ['GenerateImage', 'Read'] },
        ],
      },
    });
  });

  it('awaits asynchronous skill activation before returning success', async () => {
    const activateSkill = vi.fn(async () => ({
      success: true as const,
      allowedTools: ['bash'],
    }));
    const tool = new ActivateSkillTool();
    expect(tool.description).toContain('copy an exact registeredSkills.name');
    expect(tool.description).toContain('never construct or guess a skill name');
    tool.setRegisteredSkillNames(['storyboard', 'review']);
    expect(tool.parameters.properties.skillName?.enum).toEqual(['storyboard', 'review']);
    expect(tool.parameters.required).toContain('slot');
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    await expect(
      tool.execute({
        skillName: 'commit',
        reason: 'User asked for a commit message after I inspected the request.',
        slot: 'domainSkill',
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        activated: true,
        skillName: 'commit',
        reason: 'User asked for a commit message after I inspected the request.',
        slot: 'domainSkill',
        allowedTools: ['bash'],
      },
    });
    expect(activateSkill).toHaveBeenCalledWith({
      name: 'commit',
      reason: 'User asked for a commit message after I inspected the request.',
      slot: 'domainSkill',
    });
  });

  it('projects the canonical skill name and observable legacy alias diagnostic', async () => {
    const activateSkill = vi.fn(async () => ({
      success: true as const,
      skillName: 'media-quality-review',
      requestedSkillName: 'quality-assessment',
      diagnostics: [
        {
          code: 'legacy-skill-alias' as const,
          message: 'Legacy skill $quality-assessment was replaced by $media-quality-review.',
          skillName: 'media-quality-review',
        },
      ],
    }));
    const tool = new ActivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    await expect(
      tool.execute({
        skillName: 'quality-assessment',
        reason: 'Review generated image quality with the canonical media gate.',
        slot: 'domainSkill',
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        activated: true,
        skillName: 'media-quality-review',
        requestedSkillName: 'quality-assessment',
        reason: 'Review generated image quality with the canonical media gate.',
        slot: 'domainSkill',
        diagnostics: [
          {
            code: 'legacy-skill-alias',
            skillName: 'media-quality-review',
          },
        ],
      },
    });
  });

  it('describes and forwards lifecycle slots for supplemental skill activation', async () => {
    const activateSkill = vi.fn(async () => ({
      success: true as const,
      lifecycleRecordId: 'record-canvas',
    }));
    const tool = new ActivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    expect(tool.description).toContain('referenceSkill');
    expect(tool.description).not.toContain('Only one skill can be active at a time');

    await expect(
      tool.execute({
        skillName: 'canvas-authoring',
        reason: 'Need Canvas authoring guidance without replacing comic storyboard output rules.',
        slot: 'referenceSkill',
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        activated: true,
        skillName: 'canvas-authoring',
        reason: 'Need Canvas authoring guidance without replacing comic storyboard output rules.',
        slot: 'referenceSkill',
        lifecycleRecordId: 'record-canvas',
      },
    });
    expect(activateSkill).toHaveBeenCalledWith({
      name: 'canvas-authoring',
      reason: 'Need Canvas authoring guidance without replacing comic storyboard output rules.',
      slot: 'referenceSkill',
    });
  });

  it('keeps structured skill activation success locale-neutral in Chinese tool context', async () => {
    const activateSkill = vi.fn(async () => ({
      success: true as const,
      allowedTools: ['bash'],
    }));
    const tool = new ActivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    await expect(
      tool.execute(
        {
          skillName: 'commit',
          reason: '用户要求提交说明。',
          slot: 'domainSkill',
        },
        { metadata: { locale: 'zh-cn' } },
      ),
    ).resolves.toEqual({
      success: true,
      data: {
        activated: true,
        skillName: 'commit',
        reason: '用户要求提交说明。',
        slot: 'domainSkill',
        allowedTools: ['bash'],
      },
    });
  });

  it('localizes provider failure wrappers while preserving detail and ignoring diagnostic prose', async () => {
    const activateSkill = vi.fn(async () => ({
      success: false as const,
      code: 'provider-error' as const,
      detail: 'provider 原文: E42',
      diagnostics: [
        {
          code: 'skill-activation-rejected' as const,
          message: 'POISON LEGACY PROSE',
          conversationId: 'conv-原文',
          skillName: 'skill-原文',
          slot: 'domainSkill' as const,
        },
      ],
    }));
    const tool = new ActivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    const english = await tool.execute({
      skillName: 'skill-原文',
      reason: 'needed',
      slot: 'domainSkill',
    });
    const chinese = await tool.execute(
      { skillName: 'skill-原文', reason: 'needed', slot: 'domainSkill' },
      { metadata: { locale: 'zh-cn' } },
    );

    expect(english).toEqual({
      success: false,
      error:
        'The provider failed while activating skill "skill-原文". Details: {"code":"skill-activation-rejected","conversationId":"conv-原文","skillName":"skill-原文","slot":"domainSkill"}; provider 原文: E42',
    });
    expect(chinese).toEqual({
      success: false,
      error:
        '激活技能 "skill-原文" 时提供商失败。 详情：{"code":"skill-activation-rejected","conversationId":"conv-原文","skillName":"skill-原文","slot":"domainSkill"}; provider 原文: E42',
    });
    expect(JSON.stringify([english, chinese])).not.toContain('POISON LEGACY PROSE');
  });

  it('rejects agent-driven skill activation without a non-empty reason', async () => {
    const activateSkill = vi.fn();
    const tool = new ActivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    await expect(tool.execute({ skillName: 'commit' })).resolves.toEqual({
      success: false,
      error: 'Invalid skill activation arguments.',
    });
    await expect(
      tool.execute({ skillName: 'commit', reason: '   ', slot: 'domainSkill' }),
    ).resolves.toEqual({
      success: false,
      error: 'An activation reason is required.',
    });
    expect(activateSkill).not.toHaveBeenCalled();
  });

  it('localizes Skill Tool boundary failures without translating stable input values', async () => {
    const activateTool = new ActivateSkillTool();
    const deactivateTool = new DeactivateSkillTool();

    await expect(
      activateTool.execute(
        { skillName: 'commit', reason: 'needed', slot: 'domainSkill' },
        { metadata: { locale: 'zh-cn' } },
      ),
    ).resolves.toEqual({
      success: false,
      error: '技能系统不可用。',
    });
    await expect(deactivateTool.execute({}, { metadata: { locale: 'zh-cn' } })).resolves.toEqual({
      success: false,
      error: '技能系统不可用。',
    });

    const activateSkill = vi.fn();
    activateTool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    await expect(
      activateTool.execute({ skillName: 'commit' }, { metadata: { locale: 'zh-cn' } }),
    ).resolves.toEqual({
      success: false,
      error: '技能激活参数无效。',
    });
    await expect(
      activateTool.execute(
        { skillName: 'commit', reason: '   ', slot: 'domainSkill' },
        { metadata: { locale: 'zh-cn' } },
      ),
    ).resolves.toEqual({
      success: false,
      error: '必须提供激活原因。',
    });
    await expect(
      activateTool.execute(
        { skillName: 'commit', reason: 'needed', slot: 'slot-原文' },
        { metadata: { locale: 'zh-cn' } },
      ),
    ).resolves.toEqual({
      success: false,
      error: '技能生命周期槽位无效：slot-原文',
    });
    expect(activateSkill).not.toHaveBeenCalled();
  });

  it('awaits asynchronous skill deactivation before returning success', async () => {
    const deactivateSkill = vi.fn(async () => ({
      success: true as const,
    }));
    const tool = new DeactivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill,
    });

    await expect(tool.execute({})).resolves.toEqual({
      success: true,
      data: {
        deactivated: true,
      },
    });
    expect(deactivateSkill).toHaveBeenCalled();
  });

  it('returns locked runtime Skill diagnostics through GetContext and DeactivateSkill', async () => {
    const deactivateSkill = vi.fn(async () => ({
      success: false,
      code: 'deactivation-rejected' as const,
      diagnostics: [
        {
          code: 'locked-deactivation' as const,
          message: 'Runtime-owned prompt-chain Skill cannot be cleared manually',
          conversationId: 'conv-1',
          recordId: 'record-runtime',
          skillName: 'runtime-reference',
          slot: 'promptChainSkill' as const,
        },
      ],
    }));
    const provider = {
      listSkills: vi.fn(async () => []),
      getActiveSkill: vi.fn(async () => null),
      getActiveSkillLifecycle: vi.fn(async () => ({
        records: [
          {
            id: 'record-runtime',
            skillName: 'runtime-reference',
            slot: 'promptChainSkill' as const,
            owner: 'runtime' as const,
            clearable: false,
            lockedReason: 'Runtime-owned prompt-chain Skill cannot be cleared manually',
            status: 'active' as const,
          },
        ],
        diagnostics: [],
      })),
      activateSkill: vi.fn(),
      deactivateSkill,
    };
    const contextTool = new GetContextTool(createCategoryRegistryMock());
    contextTool.setSkillProvider(provider);
    const deactivateTool = new DeactivateSkillTool();
    deactivateTool.setSkillProvider(provider);

    await expect(contextTool.execute({})).resolves.toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          activeSkillLifecycle: {
            records: [
              expect.objectContaining({
                id: 'record-runtime',
                slot: 'promptChainSkill',
                clearable: false,
              }),
            ],
            diagnostics: [],
          },
        }),
      }),
    );
    const contextResult = await contextTool.execute({});
    expect(JSON.stringify(contextResult)).not.toContain(
      'Runtime-owned prompt-chain Skill cannot be cleared manually',
    );
    await expect(deactivateTool.execute({ recordId: 'record-runtime' })).resolves.toEqual({
      success: false,
      error:
        'The skill was not deactivated. Details: {"code":"locked-deactivation","conversationId":"conv-1","skillName":"runtime-reference","slot":"promptChainSkill","recordId":"record-runtime"}',
    });
    expect(deactivateSkill).toHaveBeenCalledWith({ recordId: 'record-runtime' });
  });

  it('creates a complete portable Skill through the per-conversation provider', async () => {
    const createSkill = vi.fn(async () => ({
      source: 'project' as const,
      rootId: 'project-agent-skills',
      relativePath: 'story-review',
      absolutePath: '/workspace/.agents/skills/story-review',
      fingerprint: 'sha256:story-review',
      diagnostics: [
        {
          area: 'creation' as const,
          code: 'skill-created-warning',
          severity: 'warning' as const,
          message: 'POISON SUCCESS PROSE',
          path: 'story-review',
        },
      ],
    }));
    const tool = new CreateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      createSkill,
    });
    const input = {
      target: 'project',
      skill: {
        name: 'story-review',
        description: 'Review story structure.',
        body: '# Story Review\n\nReview the supplied story.',
        metadata: { domain: 'story' },
        allowedTools: ['Read'],
      },
      resources: [
        {
          path: 'references/checklist.md',
          encoding: 'utf8',
          content: '# Checklist',
        },
      ],
      neko: {
        schemaVersion: 1,
        interface: { displayName: 'Story Review' },
        dependencies: {
          capabilities: [{ id: 'story.read', requirement: 'required' }],
        },
      },
    };

    await expect(tool.execute(input)).resolves.toEqual({
      success: true,
      data: {
        created: true,
        source: 'project',
        rootId: 'project-agent-skills',
        relativePath: 'story-review',
        absolutePath: '/workspace/.agents/skills/story-review',
        fingerprint: 'sha256:story-review',
        diagnostics: [
          {
            area: 'creation',
            code: 'skill-created-warning',
            severity: 'warning',
            path: 'story-review',
          },
        ],
      },
    });
    expect(JSON.stringify(await tool.execute(input))).not.toContain('POISON SUCCESS PROSE');
    expect(createSkill).toHaveBeenCalledWith(input);
  });

  it('projects typed creation failures by locale while preserving external detail', async () => {
    const createSkill = vi.fn(async () => {
      throw Object.assign(new Error('POISON LEGACY PROSE'), {
        code: 'skill-already-exists',
        detail: 'provider 原文: E42',
        diagnostics: [
          {
            area: 'creation',
            code: 'skill-already-exists',
            severity: 'error',
            message: 'POISON LEGACY PROSE',
            path: 'story-review',
          },
        ],
      });
    });
    const tool = new CreateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      createSkill,
    });

    const input = {
      target: 'project',
      skill: {
        name: 'story-review',
        description: 'Review story structure.',
        body: '# Story Review',
      },
    };
    const english = await tool.execute(input);
    const chinese = await tool.execute(input, { metadata: { locale: 'zh-cn' } });

    expect(english).toEqual({
      success: false,
      error:
        'Skill "story-review" already exists. Details: {"area":"creation","code":"skill-already-exists","severity":"error","path":"story-review"}; provider 原文: E42',
      data: {
        code: 'skill-already-exists',
        diagnostics: [
          {
            area: 'creation',
            code: 'skill-already-exists',
            severity: 'error',
            path: 'story-review',
          },
        ],
        detail: 'provider 原文: E42',
      },
    });
    expect(chinese).toEqual({
      success: false,
      error:
        '技能 "story-review" 已存在。 详情：{"area":"creation","code":"skill-already-exists","severity":"error","path":"story-review"}; provider 原文: E42',
      data: english.data,
    });
    expect(JSON.stringify([english, chinese])).not.toContain('POISON LEGACY PROSE');
  });

  it('rejects malformed native Skill creation input before provider invocation', async () => {
    const createSkill = vi.fn();
    const tool = new CreateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      createSkill,
    });

    const invalidInput = {
      target: 'project',
      skill: {
        name: 'story-review',
        description: 'Review story structure.',
      },
    };
    await expect(tool.execute(invalidInput)).resolves.toEqual({
      success: false,
      error: 'Invalid CreateSkill input',
    });
    await expect(tool.execute(invalidInput, { metadata: { locale: 'zh-cn' } })).resolves.toEqual({
      success: false,
      error: 'CreateSkill 输入无效。',
    });
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('localizes unavailable Skill creation without invoking a fallback provider', async () => {
    const tool = new CreateSkillTool();
    const input = {
      target: 'project',
      skill: {
        name: 'story-review',
        description: 'Review story structure.',
        body: '# Story Review',
      },
    };

    await expect(tool.execute(input)).resolves.toEqual({
      success: false,
      error: 'Skill creation is not initialized',
    });
    await expect(tool.execute(input, { metadata: { locale: 'zh-cn' } })).resolves.toEqual({
      success: false,
      error: '技能创建功能不可用。',
    });
  });

  it('rejects Host-owned or lifecycle fields instead of silently accepting them', async () => {
    const createSkill = vi.fn();
    const tool = new CreateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      createSkill,
    });
    const baseInput = {
      target: 'project',
      skill: {
        name: 'story-review',
        description: 'Review story structure.',
        body: '# Story Review',
      },
    };

    await expect(tool.execute({ ...baseInput, approval: 'approved' })).resolves.toEqual({
      success: false,
      error: 'Invalid CreateSkill input',
    });
    await expect(
      tool.execute({
        ...baseInput,
        skill: { ...baseInput.skill, trusted: true },
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Invalid CreateSkill input',
    });
    await expect(
      tool.execute({
        ...baseInput,
        neko: { schemaVersion: 1, enabled: true },
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Invalid CreateSkill input',
    });
    expect(createSkill).not.toHaveBeenCalled();
    expect(tool.parameters.additionalProperties).toBe(false);
  });

  it('sets execution mode through the typed Agent meta tool provider path without provider prose', async () => {
    const setExecutionMode = vi.fn(async () => ({
      success: true as const,
      changed: true,
      requestedMode: 'plan' as const,
      effectiveMode: 'plan' as const,
      message: 'POISON LEGACY PROSE',
    }));
    const tool = new SetExecutionModeTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      setExecutionMode,
    });

    const result = await tool.execute({ mode: 'plan', reason: 'Dry run first' });
    expect(result).toEqual({
      success: true,
      data: {
        changed: true,
        requestedMode: 'plan',
        mode: 'plan',
      },
    });
    expect(JSON.stringify(result)).not.toContain('POISON LEGACY PROSE');
    expect(setExecutionMode).toHaveBeenCalledWith({
      mode: 'plan',
      reason: 'Dry run first',
    });
  });

  it('localizes execution mode provider failures while preserving external detail', async () => {
    const setExecutionMode = vi.fn(async () => ({
      success: false as const,
      code: 'provider-error' as const,
      detail: 'provider 原文: E42',
      message: 'POISON LEGACY PROSE',
    }));
    const tool = new SetExecutionModeTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      setExecutionMode,
    });

    const english = await tool.execute({ mode: 'ask' });
    const chinese = await tool.execute({ mode: 'ask' }, { metadata: { locale: 'zh-cn' } });

    expect(english).toEqual({
      success: false,
      error: 'The provider failed while activating the execution mode. Details: provider 原文: E42',
    });
    expect(chinese).toEqual({
      success: false,
      error: '激活执行模式时提供商失败。 详情：provider 原文: E42',
    });
    expect(JSON.stringify([english, chinese])).not.toContain('POISON LEGACY PROSE');
  });

  it('rejects invalid execution mode meta tool input before provider invocation', async () => {
    const setExecutionMode = vi.fn();
    const tool = new SetExecutionModeTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      setExecutionMode,
    });

    await expect(tool.execute({ mode: 'hidden-idc' })).resolves.toEqual({
      success: false,
      error: 'Invalid execution mode.',
    });
    await expect(
      tool.execute({ mode: 'hidden-idc' }, { metadata: { locale: 'zh-cn' } }),
    ).resolves.toEqual({
      success: false,
      error: '执行模式无效。',
    });
    await expect(
      tool.execute({ mode: 'plan', reason: 42 }, { metadata: { locale: 'zh-cn' } }),
    ).resolves.toEqual({
      success: false,
      error: '执行模式参数无效。',
    });
    expect(setExecutionMode).not.toHaveBeenCalled();
  });

  it('localizes unavailable execution mode activation without a fallback provider', async () => {
    const tool = new SetExecutionModeTool();

    await expect(tool.execute({ mode: 'auto' })).resolves.toEqual({
      success: false,
      error: 'Execution mode activation is unavailable.',
    });
    await expect(
      tool.execute({ mode: 'auto' }, { metadata: { locale: 'zh-cn' } }),
    ).resolves.toEqual({
      success: false,
      error: '执行模式激活功能不可用。',
    });
  });
});

function createCategoryRegistryMock(): IToolCategoryRegistry {
  return {
    registerCategory: vi.fn(),
    getCategory: vi.fn(),
    listCategories: vi.fn(() => []),
    getToolsByCategory: vi.fn(() => []),
    getToolsByLayer: vi.fn(() => []),
    categorizeTool: vi.fn(),
    getToolInfo: vi.fn(),
    calculateTokenCost: vi.fn(() => 0),
    setToolTokenCost: vi.fn(),
    setToolActive: vi.fn(),
  };
}

function createGroupRegistryMock(): IToolGroupRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
    listEnabled: vi.fn(() => []),
    getActiveTools: vi.fn(() => []),
    getDefaultTools: vi.fn(() => []),
    getGroupsForTool: vi.fn(() => []),
  };
}
