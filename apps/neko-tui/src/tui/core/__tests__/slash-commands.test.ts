import { describe, expect, it, vi } from 'vitest';
import { getBuiltinSkills } from '@neko/skills';
import type { Skill } from '@neko/shared';
import { handleSkillInvocation, handleSlashCommand, isSkillInvocation } from '../slash-commands';
import type { CLIConfig } from '../types';

function createConfig(): CLIConfig {
  return {
    provider: 'anthropic',
    providerType: 'anthropic',
    providerRequiresApiKey: true,
    model: 'claude-sonnet',
    mediaModels: [],
    maxTokens: 4096,
    temperature: 0.3,
    verbose: false,
    workDir: '/workspace/demo',
    mcpServers: [],
    outputFormat: 'text',
    thinkingBudget: 0,
  };
}

describe('handleSlashCommand', () => {
  it('returns lifecycle activation and a normal Agent prompt for command artifacts', async () => {
    const skill = {
      name: '剪辑: 快速 workflow',
      entryPointKind: 'command-artifact',
      command: 'commit',
    } as never;

    const skillService = {
      registry: {
        skillCount: 1,
        listSkills: vi.fn(() => [skill]),
        listAllSkills: vi.fn(() => [skill]),
        getSkill: vi.fn(),
        getSkillByCommand: vi.fn((name: string) => (name === 'commit' ? skill : undefined)),
        searchSkills: vi.fn(() => []),
      },
      skillCount: 1,
      apply: vi.fn(async () => ({ type: 'slash-command' })),
    };

    const result = await handleSlashCommand('/commit fix bug', {
      locale: 'en',
      config: createConfig(),
      skillService: skillService as never,
    });

    expect(result.handled).toBe(true);
    expect(result.output).toBeUndefined();
    expect(result.skillSemantic).toEqual({ kind: 'activated', skillName: '/commit' });
    expect(result.agentPrompt).toBe('fix bug');
    expect(result.lifecycleActivation).toEqual({
      skillName: '剪辑: 快速 workflow',
      args: 'fix bug',
    });
  });

  it('does not treat ordinary skill legacy command fields as slash commands', async () => {
    const skill = {
      name: 'quality-review',
      command: 'commit',
      description: 'Ordinary Skill with legacy command metadata',
      enabled: true,
    } as never;

    const skillService = {
      registry: {
        skillCount: 1,
        listSkills: vi.fn(() => [skill]),
        listAllSkills: vi.fn(() => [skill]),
        getSkill: vi.fn(),
        getSkillByCommand: vi.fn((name: string) => (name === 'commit' ? skill : undefined)),
        searchSkills: vi.fn(() => []),
      },
      skillCount: 1,
      apply: vi.fn(async () => ({ type: 'slash-command' })),
    };

    const result = await handleSlashCommand('/commit fix bug', {
      locale: 'en',
      config: createConfig(),
      skillService: skillService as never,
    });

    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(skillService.apply).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: false, continueExecution: true });
    expect(result.output).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('does not treat builtin commands as agent-execution slash prompts', async () => {
    const result = await handleSlashCommand('/plan', {
      locale: 'en',
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.agentPrompt).toBeUndefined();
  });

  it('poisons shared final-prose paths for TUI resource commands', async () => {
    for (const input of ['/help', '/h', '/skills', '/commands', '/cmds', '/tools']) {
      const result = await handleSlashCommand(input, {
        locale: 'zh-cn',
        config: createConfig(),
      });

      expect(result).toEqual({ handled: false, continueExecution: true });
      expect(result.output).toBeUndefined();
      expect(result.error).toBeUndefined();
    }
  });

  it('does not retain legacy config, resume, or history success paths', async () => {
    for (const input of [
      '/config',
      '/config migrate',
      '/resume conversation-id',
      '/history',
      '/market',
    ]) {
      const result = await handleSlashCommand(input, {
        locale: 'en',
        config: createConfig(),
      });

      expect(result.handled).toBe(false);
      expect(result.output).toBeUndefined();
      expect(result.error).toBeUndefined();
    }
  });

  it('does not retain a second legacy media command success path', async () => {
    const result = await handleSlashCommand('/media music', {
      locale: 'en',
      config: createConfig(),
    });

    expect(result.handled).toBe(false);
    expect(result.output).toBeUndefined();
  });
});

describe('handleSkillInvocation', () => {
  it('resolves the system skill-creator through the dollar Skill namespace', async () => {
    const skillService = createSkillServiceMock(getBuiltinSkills());

    const result = await handleSkillInvocation('$skill-creator create a reusable review skill', {
      locale: 'en',
      config: createConfig(),
      skillService: skillService as never,
    });

    expect(skillService.registry.getSkill).toHaveBeenCalledWith('skill-creator');
    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        semantic: { kind: 'activated', skillName: 'skill-creator' },
        lifecycleActivation: {
          skillName: 'skill-creator',
          args: 'create a reusable review skill',
        },
      }),
    );
  });

  it('applies dollar skill invocations by canonical skill name', async () => {
    const skill = {
      name: 'quality-review',
      description: 'Review changed files',
      content: 'Review instructions',
      enabled: true,
    };
    const skillService = createSkillServiceMock([skill]);

    const result = await handleSkillInvocation('$quality-review changed files', {
      locale: 'en',
      config: createConfig(),
      skillService: skillService as never,
    });

    expect(isSkillInvocation('$quality-review changed files')).toBe(true);
    expect(skillService.registry.getSkill).toHaveBeenCalledWith('quality-review');
    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('quality-review');
    expect(skillService.apply).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        semantic: { kind: 'activated', skillName: 'quality-review' },
        lifecycleActivation: {
          skillName: 'quality-review',
          args: 'changed files',
        },
        agentPrompt: 'changed files',
      }),
    );
  });

  it('returns visible diagnostics for unknown and disabled dollar skills', async () => {
    const disabled = {
      name: 'disabled-skill',
      description: 'Disabled',
      content: 'Disabled instructions',
      enabled: false,
    };
    const skillService = createSkillServiceMock([disabled]);

    await expect(
      handleSkillInvocation('$missing', {
        locale: 'en',
        config: createConfig(),
        skillService: skillService as never,
      }),
    ).resolves.toEqual({
      handled: true,
      semantic: { kind: 'not-found', skillName: 'missing' },
    });
    await expect(
      handleSkillInvocation('$disabled-skill', {
        locale: 'en',
        config: createConfig(),
        skillService: skillService as never,
      }),
    ).resolves.toEqual({
      handled: true,
      semantic: { kind: 'disabled', skillName: 'disabled-skill' },
    });
  });
});

function createSkillServiceMock(skills: Array<Partial<Skill>>) {
  return {
    registry: {
      skillCount: skills.length,
      listSkills: vi.fn(() => skills),
      listAllSkills: vi.fn(() => skills),
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      getSkillByCommand: vi.fn((command: string) =>
        skills.find((skill) => skill.command === command),
      ),
      searchSkills: vi.fn(() => []),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
    },
    skillCount: skills.length,
    apply: vi.fn(async (skill: Partial<Skill>, args?: string) => ({
      name: skill.name,
      systemPrompt: args ? `${skill.content}: ${args}` : skill.content,
      type: 'skill',
    })),
  };
}
