import { describe, expect, it, vi } from 'vitest';
import type {
  IToolCategoryRegistry,
  IToolGroupRegistry,
  SkillMediaWorkflowHint,
} from '@neko/shared';
import { ActivateSkillTool, DeactivateSkillTool, GetContextTool } from '../meta-tools';
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
