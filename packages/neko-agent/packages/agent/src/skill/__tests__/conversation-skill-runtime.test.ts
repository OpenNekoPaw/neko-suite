import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillDiscoveryResult, SkillInjection } from '@neko/shared';
import { ConversationSkillRuntime } from '../conversation-skill-runtime';

function createSkill(
  name: string,
  command?: string,
  entryPointKind?: Skill['entryPointKind'],
): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `${name} instructions`,
    source: 'project',
    enabled: true,
    ...(command ? { command } : {}),
    ...(entryPointKind ? { entryPointKind } : {}),
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
    const commit = createSkill('commit', 'commit', 'command-artifact');
    const review = createSkill('review', 'review', 'command-artifact');
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

  it('reports legacy slash skill aliases as migration-only diagnostics', async () => {
    const legacy = createSkill('legacy-skill', 'legacy');
    const skillService = createSkillService([legacy]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySlashCommand({
        command: 'legacy',
        conversationId: 'conv-1',
      }),
    ).resolves.toEqual({
      applied: false,
      error: 'Legacy slash Skill alias is not canonical: /legacy. Use $legacy-skill.',
    });
    expect(skillService.apply).not.toHaveBeenCalled();
  });

  it('applies explicit skill invocation by canonical skill name without slash command lookup', async () => {
    const statusCommand = createSkill('status-command', 'status');
    const statusSkill = createSkill('status');
    const skillService = createSkillService([statusCommand, statusSkill]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.applySkillInvocation({
      skillName: 'status',
      conversationId: 'conv-1',
      args: 'changed files',
    });

    expect(skillService.registry.getSkill).toHaveBeenCalledWith('status');
    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('status');
    expect(skillService.apply).toHaveBeenCalledWith(statusSkill, 'changed files');
    expect(result).toEqual(expect.objectContaining({ applied: true, skill: statusSkill }));
  });

  it('does not let legacy slash skill lookup produce canonical skill invocation success', async () => {
    const commit = createSkill('commit');
    const skillService = createSkillService([commit]);
    skillService.registry.getSkillByCommand.mockImplementation(() => {
      throw new Error('legacy slash path should not run');
    });
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    const result = await runtime.applySkillInvocation({
      skillName: '$Commit',
      conversationId: 'conv-1',
    });

    expect(skillService.registry.getSkill).toHaveBeenCalledWith('commit');
    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ applied: true, skill: commit }));
  });

  it('returns fail-visible diagnostics for unknown and disabled skill invocation', async () => {
    const disabled = { ...createSkill('disabled-skill'), enabled: false };
    const skillService = createSkillService([disabled]);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySkillInvocation({ skillName: 'missing', conversationId: 'conv-1' }),
    ).resolves.toEqual({ applied: false, error: 'Unknown skill: $missing' });
    await expect(
      runtime.applySkillInvocation({ skillName: 'disabled-skill', conversationId: 'conv-1' }),
    ).resolves.toEqual({ applied: false, error: 'Skill is disabled: $disabled-skill' });
  });

  it('returns fail-visible diagnostics when lazy skill activation cannot load content', async () => {
    const lazy = { ...createSkill('lazy-skill'), content: '' };
    const skillService = createSkillService([lazy]);
    skillService.registry.ensureLoaded.mockResolvedValue(lazy);
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySkillInvocation({ skillName: 'lazy-skill', conversationId: 'conv-1' }),
    ).resolves.toEqual({ applied: false, error: 'Skill has no content: $lazy-skill' });
  });

  it('returns fail-visible diagnostics when lazy loading rejects', async () => {
    const lazy = createSkill('lazy-skill');
    const skillService = createSkillService([lazy]);
    skillService.registry.ensureLoaded.mockRejectedValue(new Error('manifest invalid'));
    const runtime = new ConversationSkillRuntime({ skillService: skillService as any });

    await expect(
      runtime.applySkillInvocation({ skillName: 'lazy-skill', conversationId: 'conv-1' }),
    ).resolves.toEqual({
      applied: false,
      error: 'Failed to load skill: $lazy-skill: manifest invalid',
    });
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
