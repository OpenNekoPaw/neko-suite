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
  return {
    config: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test-1234567890',
      baseUrl: undefined,
      maxTokens: 4096,
      temperature: 0.7,
      workDir: '/test/workspace',
      skillsDir: '/test/skills',
      outputFormat: 'text',
      verbose: false,
      mcpServers: [],
    },
    skillService: {
      skillCount: 5,
      commandCount: 3,
      getActiveSkill: vi.fn().mockReturnValue(null),
    },
    toolRegistry: {
      size: 12,
    },
    conversations: {
      getActiveId: vi.fn().mockReturnValue('conv-123'),
      list: vi.fn().mockReturnValue([{ id: 'conv-123' }, { id: 'conv-456' }]),
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

  it('should include command aliases', () => {
    const helpText = generateCliHelpText();
    expect(helpText).toContain('/h');
    expect(helpText).toContain('/cfg');
  });

  it('should include usage hints', () => {
    const helpText = generateCliHelpText();
    expect(helpText).toContain('[set <key> <value>');
  });
});

describe('generateExtensionHelpText', () => {
  it('should generate markdown help text', () => {
    const helpText = generateExtensionHelpText();
    expect(helpText).toContain('**Available Commands:**');
    expect(helpText).toContain('`/help`');
  });

  it('should include skill commands if provided', () => {
    const helpText = generateExtensionHelpText(['/commit', '/review']);
    expect(helpText).toContain('**Skill Commands:**');
    expect(helpText).toContain('`/commit`');
    expect(helpText).toContain('`/review`');
  });

  it('should include tips section', () => {
    const helpText = generateExtensionHelpText();
    expect(helpText).toContain('**Tips:**');
    expect(helpText).toContain('Use `@` to reference files');
  });

  it('should work without skill commands', () => {
    const helpText = generateExtensionHelpText();
    expect(helpText).not.toContain('**Skill Commands:**');
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
    expect(data.tokenCount).toBe(1500);
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
