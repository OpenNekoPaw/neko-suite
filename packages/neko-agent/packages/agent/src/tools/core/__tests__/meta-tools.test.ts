import { describe, expect, it, vi } from 'vitest';
import type {
  IToolCategoryRegistry,
  IToolGroupRegistry,
  SkillMediaWorkflowHint,
} from '@neko/shared';
import {
  ActivateSkillTool,
  DeactivateSkillTool,
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
      name: 'media-to-video',
      description: 'Coordinate media workflows',
      domain: 'media',
      relatedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
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
          name: 'media-to-video',
          description: 'Coordinate media workflows',
          domain: 'media',
          relatedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
          mediaWorkflow: {
            acceptedModalities: ['comic'],
            producedArtifacts: ['StoryboardTable'],
          },
        },
        registeredSkills: [
          {
            name: 'media-to-video',
            description: 'Coordinate media workflows',
            domain: 'media',
            relatedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
            mediaWorkflow: {
              acceptedModalities: ['comic'],
              producedArtifacts: ['StoryboardTable'],
            },
          },
        ],
        toolCategories: [],
      },
    });
  });

  it('awaits asynchronous skill activation before returning success', async () => {
    const activateSkill = vi.fn(async () => ({
      success: true,
      message: 'Activated skill "commit"',
      allowedTools: ['bash'],
    }));
    const tool = new ActivateSkillTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill,
      deactivateSkill: vi.fn(),
    });

    await expect(tool.execute({ skillName: 'commit' })).resolves.toEqual({
      success: true,
      data: {
        activated: true,
        skillName: 'commit',
        message: 'Activated skill "commit"',
        allowedTools: ['bash'],
      },
    });
    expect(activateSkill).toHaveBeenCalledWith('commit');
  });

  it('awaits asynchronous skill deactivation before returning success', async () => {
    const deactivateSkill = vi.fn(async () => ({
      success: true,
      message: 'Skill deactivated',
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
        message: 'Skill deactivated',
      },
    });
    expect(deactivateSkill).toHaveBeenCalled();
  });

  it('returns locked Creation stage persona diagnostics through GetContext and DeactivateSkill', async () => {
    const deactivateSkill = vi.fn(async () => ({
      success: false,
      message: 'Creation stage persona is cleared when its owning stage exits',
      diagnostics: [
        {
          code: 'locked-deactivation' as const,
          message: 'Creation stage persona is cleared when its owning stage exits',
          conversationId: 'conv-1',
          recordId: 'record-stage',
          skillName: 'creation-persona',
          slot: 'stagePersona' as const,
        },
      ],
    }));
    const provider = {
      listSkills: vi.fn(async () => []),
      getActiveSkill: vi.fn(async () => null),
      getActiveSkillLifecycle: vi.fn(async () => ({
        records: [
          {
            id: 'record-stage',
            skillName: 'creation-persona',
            slot: 'stagePersona' as const,
            owner: 'creation-profile' as const,
            clearable: false,
            lockedReason: 'Creation stage persona is cleared when its owning stage exits',
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
                id: 'record-stage',
                slot: 'stagePersona',
                clearable: false,
                lockedReason: 'Creation stage persona is cleared when its owning stage exits',
              }),
            ],
            diagnostics: [],
          },
        }),
      }),
    );
    await expect(deactivateTool.execute({ recordId: 'record-stage' })).resolves.toEqual({
      success: false,
      error: 'Creation stage persona is cleared when its owning stage exits',
    });
    expect(deactivateSkill).toHaveBeenCalledWith({ recordId: 'record-stage' });
  });

  it('sets execution mode through the typed Agent meta tool provider path', async () => {
    const setExecutionMode = vi.fn(async () => ({
      success: true,
      message: 'Execution mode set to plan',
      mode: 'plan' as const,
    }));
    const tool = new SetExecutionModeTool();
    tool.setSkillProvider({
      listSkills: vi.fn(),
      getActiveSkill: vi.fn(),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
      setExecutionMode,
    });

    await expect(tool.execute({ mode: 'plan', reason: 'Dry run first' })).resolves.toEqual({
      success: true,
      data: {
        changed: true,
        mode: 'plan',
        message: 'Execution mode set to plan',
      },
    });
    expect(setExecutionMode).toHaveBeenCalledWith({
      mode: 'plan',
      reason: 'Dry run first',
    });
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
      error: 'Invalid execution mode',
    });
    expect(setExecutionMode).not.toHaveBeenCalled();
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
