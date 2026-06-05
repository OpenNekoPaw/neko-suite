import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillDiscoveryResult, SkillInjection } from '@neko/shared';
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

function createSkillService(
  skills: readonly Skill[],
  discoverResult: SkillDiscoveryResult = {
    found: false,
    matches: [],
    requiresConfirmation: false,
  },
) {
  return {
    registry: {
      listSkills: vi.fn(() => skills),
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      getSkillByCommand: vi.fn((command: string) =>
        skills.find((skill) => skill.command === command),
      ),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
    },
    apply: vi.fn(
      async (skill: Skill, args?: string): Promise<SkillInjection> => ({
        name: skill.name,
        systemPrompt: args ? `${skill.content}: ${args}` : skill.content,
        type: 'skill',
        allowedTools: ['read'],
      }),
    ),
    discover: vi.fn(() => discoverResult),
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

  it('auto-activates high-confidence discovered skills for a conversation', async () => {
    const storyboard = createSkill('comic-to-storyboard');
    const skillService = createSkillService([storyboard], {
      found: true,
      matches: [{ skill: storyboard, relevance: 0.95, reason: 'artifact match' }],
      topMatch: { skill: storyboard, relevance: 0.95, reason: 'artifact match' },
      requiresConfirmation: false,
    });
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      agentBridge: bridge,
      now: () => 99,
    });

    const result = await runtime.autoActivateSkill({
      conversationId: 'conv-1',
      userInput: '生成分镜表',
    });

    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('comic-to-storyboard');
    expect(result).toEqual(expect.objectContaining({ applied: true, skill: storyboard }));
    expect(runtime.getActiveSkill('conv-1')).toEqual({
      skill: storyboard,
      injection: expect.objectContaining({ name: 'comic-to-storyboard' }),
      appliedAt: 99,
    });
    expect(bridge.applySkillInjection).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ name: 'comic-to-storyboard' }),
      storyboard,
    );
  });

  it('does not auto-activate matches that require confirmation', async () => {
    const storyboard = createSkill('comic-to-storyboard');
    const skillService = createSkillService([storyboard], {
      found: true,
      matches: [{ skill: storyboard, relevance: 0.5, reason: 'weak match' }],
      topMatch: { skill: storyboard, relevance: 0.5, reason: 'weak match' },
      requiresConfirmation: true,
    });
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.autoActivateSkill({
      conversationId: 'conv-1',
      userInput: 'maybe storyboard',
    });

    expect(result).toBeNull();
    expect(skillService.registry.ensureLoaded).not.toHaveBeenCalled();
    expect(runtime.getActiveSkill('conv-1')).toBeUndefined();
  });
});
