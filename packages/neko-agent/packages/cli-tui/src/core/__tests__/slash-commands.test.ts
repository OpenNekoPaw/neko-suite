import { describe, expect, it, vi } from 'vitest';
import { FileConversationStorage, type ConversationRecord } from '@neko/agent';
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

function createMemoryConversationStorage(workDir: string): FileConversationStorage {
  const files = new Map<string, string>();
  return new FileConversationStorage({
    indexFilePath: '/tmp/conversations-index.json',
    workDir,
    readFile: async (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return content;
    },
    writeFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    exists: async (filePath) => files.has(filePath),
  });
}

describe('handleSlashCommand', () => {
  it('returns agent execution overrides for command artifact slash commands with arguments', async () => {
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
      config: createConfig(),
      skillService: skillService as never,
    });

    expect(result.handled).toBe(true);
    expect(result.agentPrompt).toBe('fix bug');
    expect(result.lifecycleActivation).toEqual({
      skillName: '剪辑: 快速 workflow',
      args: 'fix bug',
    });
    expect(result.executionOverrides?.metadata).toEqual({
      agentCreation: {
        entrySignal: 'prompt-chain-skill',
        taskShape: 'multi-step',
        creationKind: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
      },
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
      config: createConfig(),
      skillService: skillService as never,
    });

    expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
    expect(skillService.apply).not.toHaveBeenCalled();
    expect(result.handled).toBe(false);
    expect(result.error).toContain('Unknown command: /commit');
  });

  it('does not treat builtin commands as agent-execution slash prompts', async () => {
    const result = await handleSlashCommand('/plan', {
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.agentPrompt).toBeUndefined();
  });

  it('localizes help output when the TUI slash context is Chinese', async () => {
    const result = await handleSlashCommand('/help', {
      locale: 'zh',
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.output).toContain('可用命令');
    expect(result.output).toContain('显示可用命令帮助');
    expect(result.output).not.toContain('Available Commands');
    expect(result.output).not.toContain('Show help message with available commands');
  });

  it('rejects removed config migration subcommand', async () => {
    const result = await handleSlashCommand('/config migrate', {
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.output).toBeUndefined();
    expect(result.error).toContain('Unknown config subcommand: migrate');
  });

  it('resumes a full conversation record through the shared runtime callback', async () => {
    const config = createConfig();
    const storage = createMemoryConversationStorage(config.workDir);
    const record: ConversationRecord = {
      id: 'conv-resume',
      version: 1,
      title: 'Storyboard draft',
      workDir: config.workDir,
      messages: [
        { role: 'user', content: '分析前10页' },
        { role: 'assistant', content: '已生成分镜表' },
      ],
      createdAt: 10,
      updatedAt: 20,
      source: 'tui',
    };
    await storage.save(record);
    await storage.flush();
    const onResumeConversation = vi.fn();
    const onLoadHistory = vi.fn();

    const result = await handleSlashCommand('/resume conv-resume', {
      config,
      conversationStorage: storage,
      currentConversationId: 'conv-current',
      onResumeConversation,
      onLoadHistory,
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('Resumed: "Storyboard draft"');
    expect(onResumeConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conv-resume', title: 'Storyboard draft' }),
    );
    expect(onLoadHistory).not.toHaveBeenCalled();
  });

  it('labels maxTokens as max output tokens in config output', async () => {
    const result = await handleSlashCommand('/config', {
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.output).toContain('maxOutputTokens: 4096');
    expect(result.output).not.toContain('maxTokens:');
  });

  it('rejects music as a top-level media category', async () => {
    const result = await handleSlashCommand('/media music', {
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.error).toContain('Valid: image, video, audio, reset');
  });
});

describe('handleSkillInvocation', () => {
  it('applies dollar skill invocations by canonical skill name', async () => {
    const skill = {
      name: 'quality-review',
      description: 'Review changed files',
      content: 'Review instructions',
      enabled: true,
    };
    const skillService = createSkillServiceMock([skill]);

    const result = await handleSkillInvocation('$quality-review changed files', {
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
        output: 'Skill activated: quality-review',
        lifecycleActivation: {
          skillName: 'quality-review',
          args: 'changed files',
        },
        agentPrompt: 'changed files',
        executionOverrides: {
          metadata: {
            agentCreation: {
              entrySignal: 'prompt-chain-skill',
              taskShape: 'multi-step',
              creationKind: 'skill:quality-review',
            },
          },
        },
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
        config: createConfig(),
        skillService: skillService as never,
      }),
    ).resolves.toEqual({ handled: true, error: 'Unknown skill: $missing' });
    await expect(
      handleSkillInvocation('$disabled-skill', {
        config: createConfig(),
        skillService: skillService as never,
      }),
    ).resolves.toEqual({ handled: true, error: 'Skill is disabled: $disabled-skill' });
  });
});

function createSkillServiceMock(skills: Array<Record<string, unknown>>) {
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
    apply: vi.fn(async (skill: Record<string, unknown>, args?: string) => ({
      name: skill.name,
      systemPrompt: args ? `${skill.content}: ${args}` : skill.content,
      type: 'skill',
    })),
  };
}
