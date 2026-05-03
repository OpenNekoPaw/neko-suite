import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { ConversationSkillRuntime } from '../conversation-skill-runtime';

function createSkill(name: string, command?: string): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `${name} instructions`,
    source: 'project',
    enabled: true,
    ...(command ? { command } : {}),
  };
}

function createSkillService(skills: readonly Skill[]) {
  return {
    registry: {
      listSkills: vi.fn(() => skills),
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      getSkillByCommand: vi.fn((command: string) =>
        skills.find((skill) => skill.command === command),
      ),
    },
    apply: vi.fn(
      async (skill: Skill, args?: string): Promise<SkillInjection> => ({
        name: skill.name,
        systemPrompt: args ? `${skill.content}: ${args}` : skill.content,
        type: 'skill',
        allowedTools: ['read'],
      }),
    ),
    discover: vi.fn(() => ({ found: false, matches: [], requiresConfirmation: false })),
  };
}

describe('ConversationSkillRuntime', () => {
  it('applies slash skills and records conversation-scoped active state', async () => {
    const commit = createSkill('commit', 'commit');
    const review = createSkill('review', 'review');
    const skillService = createSkillService([commit, review]);
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
      now: () => 42,
    });

    await expect(
      runtime.applySlashCommand({
        command: 'commit',
        conversationId: 'conv-1',
        args: 'fix bug',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        applied: true,
        skill: commit,
        injection: expect.objectContaining({ systemPrompt: 'commit instructions: fix bug' }),
      }),
    );

    expect(runtime.getActiveSkill('conv-1')).toEqual({
      skill: commit,
      injection: expect.objectContaining({ name: 'commit' }),
      appliedAt: 42,
    });
    expect(runtime.getActiveSkill('conv-2')).toBeUndefined();
    expect(bridge.applySkillInjection).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ name: 'commit' }),
      commit,
    );
  });

  it('clears active skill and delegates runtime cleanup', async () => {
    const skill = createSkill('review');
    const skillService = createSkillService([skill]);
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
    });

    await runtime.executeSkill({ skillId: 'review', conversationId: 'conv-1' });
    runtime.clearActiveSkill('conv-1');

    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
    expect(bridge.clearActiveSkill).toHaveBeenCalledWith('conv-1');
  });

  it('builds skill injection messages from active application results', async () => {
    const skill = createSkill('review');
    const skillService = createSkillService([skill]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.executeSkill({ skillId: 'review', conversationId: 'conv-1' });

    expect(runtime.buildSkillInjectionMessage(result!, 'conv-1')).toEqual({
      type: 'skillInjection',
      conversationId: 'conv-1',
      skillName: 'review',
      systemPrompt: 'review instructions',
      allowedTools: ['read'],
    });
  });
});
