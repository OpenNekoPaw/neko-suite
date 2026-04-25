import { describe, expect, it, vi } from 'vitest';
import { handleSlashCommand } from '../slash-commands';
import type { CLIConfig } from '../types';

function createConfig(): CLIConfig {
  return {
    provider: 'anthropic',
    providerType: 'anthropic',
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
  it('returns agent execution overrides for skill slash commands with arguments', async () => {
    const skill = {
      name: '剪辑: 快速 workflow',
      command: 'commit',
      phases: [{ name: 'draft' }],
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
    } as never;

    const result = await handleSlashCommand('/commit fix bug', {
      config: createConfig(),
      skillService,
    });

    expect(result.handled).toBe(true);
    expect(result.agentPrompt).toBe('fix bug');
    expect(result.executionOverrides?.metadata).toEqual({
      idc: {
        entrySignal: 'workflow-template',
        taskShape: 'multi-step',
        runKind: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
        workflowId: 'skill:%E5%89%AA%E8%BE%91%3A%20%E5%BF%AB%E9%80%9F%20workflow',
      },
    });
  });

  it('does not treat builtin commands as agent-execution slash prompts', async () => {
    const result = await handleSlashCommand('/plan', {
      config: createConfig(),
    });

    expect(result.handled).toBe(true);
    expect(result.agentPrompt).toBeUndefined();
  });
});
