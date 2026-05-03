import { describe, expect, it, vi } from 'vitest';
import { ActivateSkillTool, DeactivateSkillTool, GetContextTool } from '../meta-tools';

describe('core meta tools', () => {
  it('awaits asynchronous skill provider state for GetContext', async () => {
    const tool = new GetContextTool(
      { listCategories: () => [], getToolsByCategory: () => [] },
      { list: () => [] },
    );
    tool.setSkillProvider({
      listSkills: vi.fn(async () => [{ name: 'review', description: 'Review code' }]),
      getActiveSkill: vi.fn(async () => ({ name: 'review', description: 'Review code' })),
      activateSkill: vi.fn(),
      deactivateSkill: vi.fn(),
    });

    await expect(tool.execute({})).resolves.toEqual({
      success: true,
      data: {
        activeSkill: { name: 'review', description: 'Review code' },
        registeredSkills: [{ name: 'review', description: 'Review code' }],
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
