/**
 * Core Handlers Tests
 *
 * Tests for core command handlers: help, status, clear, exit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleHelp,
  handleStatus,
  handleClear,
  handleExit,
  generateCliHelpText,
  generateExtensionHelpText,
  generateCliStatusText,
  generateExtensionStatusData,
} from '../core-handlers';
import type { CommandContext } from '../../types';

// Mock context factory
function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  const catalogSkill = {
    name: 'commit',
    entryPointKind: 'command-artifact',
    command: 'commit',
    description: 'Create a commit message',
    enabled: true,
    supportsArguments: true,
    argumentHint: '<message>',
  };

  return {
    config: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test-1234567890',
      baseUrl: undefined,
      maxTokens: 4096,
      temperature: 0.7,
      workDir: '/test/workspace',
      outputFormat: 'text',
      verbose: false,
      mcpServers: [],
      executionMode: 'auto',
    },
    skillService: {
      skillCount: 5,
      registry: {
        skillCount: 1,
        listSkills: vi.fn(() => [catalogSkill]),
        listAllSkills: vi.fn(() => [catalogSkill]),
        getSkill: vi.fn((name: string) => (name === catalogSkill.name ? catalogSkill : undefined)),
        getSkillByCommand: vi.fn((name: string) =>
          name === catalogSkill.command ? catalogSkill : undefined,
        ),
        searchSkills: vi.fn(() => [catalogSkill]),
      },
      getActiveSkill: vi.fn().mockReturnValue(null),
      clearActiveSkill: vi.fn(),
    },
    toolRegistry: {
      size: 12,
      list: vi.fn(() => []),
      get: vi.fn(),
      search: vi.fn(() => []),
    },
    conversations: {
      getActiveId: vi.fn().mockReturnValue('conv-123'),
      list: vi.fn().mockReturnValue([{ id: 'conv-123' }, { id: 'conv-456' }]),
      getActiveMessageCount: vi.fn().mockReturnValue(3),
      create: vi.fn(),
      clearCurrent: vi.fn(),
    },
    planMode: {
      isEnabled: vi.fn().mockReturnValue(false),
    },
    contextManager: {
      getTokenCount: vi.fn().mockReturnValue(1500),
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe('generateCliHelpText', () => {
  it('should generate help text with all CLI commands', () => {
    const helpText = generateCliHelpText();
    expect(helpText).toContain('Available Commands');
    expect(helpText).toContain('/help');
    expect(helpText).toContain('/status');
    expect(helpText).toContain('/config');
  });

  it('should group commands by category', () => {
    const helpText = generateCliHelpText();
    expect(helpText).toContain('Core Commands');
    expect(helpText).toContain('Configuration');
    expect(helpText).toContain('Resource Management');
  });

  it('should localize CLI help text for Chinese command contexts', () => {
    const helpText = generateCliHelpText({ locale: 'zh' });

    expect(helpText).toContain('可用命令');
    expect(helpText).toContain('核心命令');
    expect(helpText).toContain('显示可用命令帮助');
    expect(helpText).toContain('压缩当前 Agent 上下文以节省 token');
    expect(helpText).not.toContain('Available Commands');
    expect(helpText).not.toContain('Show help message with available commands');
  });

  it('should include command aliases', () => {
    const helpText = generateCliHelpText();
    expect(helpText).toContain('/h');
    expect(helpText).toContain('/cfg');
  });

  it('should include usage hints', () => {
    const helpText = generateCliHelpText();
    expect(helpText).toContain('[set <key> <value>');
  });

  it('should include command artifact slash commands from context', () => {
    const helpText = generateCliHelpText(createMockContext());

    expect(helpText).toContain('Command Artifacts:');
    expect(helpText).toContain('/commit <message>');
    expect(helpText).toContain('Create a commit message');
  });

  it('should not include ordinary Skill legacy command fields in slash help', () => {
    const context = createMockContext();
    const legacySkill = {
      name: 'legacy-commit',
      command: 'commit',
      description: 'Legacy alias should be hidden from slash help',
      enabled: true,
    };
    context.skillService!.registry.listAllSkills = vi.fn(() => [legacySkill]);

    const helpText = generateCliHelpText(context);

    expect(helpText).not.toContain('Command Artifacts:');
    expect(helpText).not.toContain('Legacy alias should be hidden');
  });
});

describe('generateExtensionHelpText', () => {
  it('should generate markdown help text', () => {
    const helpText = generateExtensionHelpText();
    expect(helpText).toContain('**Available Commands:**');
    expect(helpText).toContain('`/help`');
  });

  it('should label retained slash skill aliases as legacy if provided', () => {
    const helpText = generateExtensionHelpText(['/commit', '/review']);
    expect(helpText).toContain('**Skill Slash Aliases (Migration):**');
    expect(helpText).toContain('`/commit`');
    expect(helpText).toContain('`/review`');
  });

  it('should include tips section', () => {
    const helpText = generateExtensionHelpText();
    expect(helpText).toContain('**Tips:**');
    expect(helpText).toContain('Use `$skill-name` to activate a clearable domain Skill');
    expect(helpText).toContain('Use `@` to reference files');
  });

  it('should work without skill commands', () => {
    const helpText = generateExtensionHelpText();
    expect(helpText).not.toContain('**Skill Slash Aliases (Migration):**');
  });
});

describe('handleHelp', () => {
  it('should return help text', () => {
    const context = createMockContext();
    const result = handleHelp([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.output).toContain('Available Commands');
    expect(result.action).toBe('showHelp');
  });

  it('should work with empty context', () => {
    const result = handleHelp([], {} as CommandContext);
    expect(result.handled).toBe(true);
  });
});

describe('generateCliStatusText', () => {
  it('should generate status text with all fields', () => {
    const context = createMockContext();
    const statusText = generateCliStatusText(context);

    expect(statusText).toContain('Current Status');
    expect(statusText).toContain('Provider:');
    expect(statusText).toContain('anthropic');
    expect(statusText).toContain('Model:');
    expect(statusText).toContain('claude-sonnet-4-6');
    expect(statusText).toContain('Max Output Tokens:');
    expect(statusText).not.toContain('Max Tokens:');
  });

  it('should mask API key', () => {
    const context = createMockContext();
    const statusText = generateCliStatusText(context);

    expect(statusText).toContain('***7890');
    expect(statusText).not.toContain('sk-test-1234567890');
  });

  it('should show resource counts', () => {
    const context = createMockContext();
    const statusText = generateCliStatusText(context);

    expect(statusText).toContain('Skills:       5');
    expect(statusText).toContain('Tools:        12');
  });

  it('should show active skill if present', () => {
    const context = createMockContext();
    context.skillService!.getActiveSkill = vi.fn().mockReturnValue({ name: 'test-skill' });

    const statusText = generateCliStatusText(context);
    expect(statusText).toContain('Active Skill:   test-skill');
  });

  it('should handle missing config gracefully', () => {
    const context = createMockContext({ config: undefined });
    const statusText = generateCliStatusText(context);

    expect(statusText).toContain('(not set)');
  });
});

describe('generateExtensionStatusData', () => {
  it('should return status data object', () => {
    const context = createMockContext();
    const data = generateExtensionStatusData(context);

    expect(data.provider).toBe('anthropic');
    expect(data.model).toBe('claude-sonnet-4-6');
    expect(data.conversationCount).toBe(2);
    expect(data.activeConversationId).toBe('conv-123');
    expect(data.messageCount).toBe(3);
    expect(data.tokenCount).toBe(1500);
    expect(data.executionMode).toBe('auto');
  });

  it('should include plan mode status', () => {
    const context = createMockContext();
    const data = generateExtensionStatusData(context);

    expect(data.planMode).toBe(false);
  });

  it('should handle missing services', () => {
    const context = createMockContext({
      conversations: undefined,
      contextManager: undefined,
    });
    const data = generateExtensionStatusData(context);

    expect(data.conversationCount).toBe(0);
    expect(data.tokenCount).toBe(0);
  });
});

describe('handleStatus', () => {
  it('should return status text and data', () => {
    const context = createMockContext();
    const result = handleStatus([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.output).toContain('Current Status');
    expect(result.action).toBe('showStatus');
    expect(result.data).toBeDefined();
  });

  it('should include both CLI and extension formats', () => {
    const context = createMockContext();
    const result = handleStatus([], context);

    expect(result.output).toBeTruthy();
    expect(result.data).toHaveProperty('provider');
    expect(result.data).toHaveProperty('model');
  });
});

describe('handleClear', () => {
  it('should clear conversation history', () => {
    const context = createMockContext();
    const result = handleClear([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.action).toBe('clearHistory');
    expect(context.conversations?.clearCurrent).toHaveBeenCalled();
  });

  it('should return ANSI clear code for CLI', () => {
    const context = createMockContext();
    const result = handleClear([], context);

    expect(result.output).toContain('\x1B[2J');
  });

  it('should work without conversations service', () => {
    const context = createMockContext({ conversations: undefined });
    const result = handleClear([], context);

    expect(result.handled).toBe(true);
  });
});

describe('handleExit', () => {
  it('should signal exit', () => {
    const context = createMockContext();
    const result = handleExit([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(false);
    expect(result.action).toBe('exit');
    expect(result.output).toBe('Goodbye!');
  });

  it('should work with empty context', () => {
    const result = handleExit([], {} as CommandContext);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(false);
  });
});
