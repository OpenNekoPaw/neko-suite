/**
 * Command Executor Tests
 *
 * Tests for command parsing, execution, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseSlashCommand,
  isSlashCommand,
  executeBuiltinCommand,
  executeSlashCommand,
  getCommandHandler,
} from '../command-executor';
import type { CommandContext, CommandResult } from '../types';

// Mock handlers
vi.mock('../handlers', () => ({
  handleHelp: vi.fn(async () => ({ handled: true, continueExecution: true, output: 'Help text' })),
  handleStatus: vi.fn(async () => ({ handled: true, continueExecution: true, output: 'Status' })),
  handleClear: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleExit: vi.fn(async () => ({ handled: true, continueExecution: false })),
  handleConfig: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleModel: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleSettings: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handlePermissions: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleInit: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleNew: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleResume: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleCompact: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handlePlan: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleSkills: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleCommands: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleTools: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleTasks: vi.fn(async () => ({ handled: true, continueExecution: true })),
  handleMcp: vi.fn(async () => ({ handled: true, continueExecution: true })),
}));

// Mock context factory
function createMockContext(): CommandContext {
  return {
    session: {
      id: 'test-session',
      messages: [],
    },
    config: {
      get: vi.fn(),
      set: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  } as unknown as CommandContext;
}

describe('parseSlashCommand', () => {
  it('should parse command without arguments', () => {
    const result = parseSlashCommand('/help');
    expect(result).toEqual({ command: 'help', args: [] });
  });

  it('should parse command with single argument', () => {
    const result = parseSlashCommand('/config key');
    expect(result).toEqual({ command: 'config', args: ['key'] });
  });

  it('should parse command with multiple arguments', () => {
    const result = parseSlashCommand('/config set key value');
    expect(result).toEqual({ command: 'config', args: ['set', 'key', 'value'] });
  });

  it('should handle extra whitespace', () => {
    const result = parseSlashCommand('  /help   arg1   arg2  ');
    expect(result).toEqual({ command: 'help', args: ['arg1', 'arg2'] });
  });

  it('should convert command to lowercase', () => {
    const result = parseSlashCommand('/HELP');
    expect(result).toEqual({ command: 'help', args: [] });
  });

  it('should handle command without slash prefix', () => {
    const result = parseSlashCommand('help');
    expect(result).toEqual({ command: 'help', args: [] });
  });

  it('should handle empty input', () => {
    const result = parseSlashCommand('');
    expect(result).toEqual({ command: '', args: [] });
  });
});

describe('isSlashCommand', () => {
  it('should return true for slash command', () => {
    expect(isSlashCommand('/help')).toBe(true);
  });

  it('should return false for regular text', () => {
    expect(isSlashCommand('help me')).toBe(false);
  });

  it('should handle whitespace before slash', () => {
    expect(isSlashCommand('  /help')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isSlashCommand('')).toBe(false);
  });
});

describe('executeBuiltinCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createMockContext();
    vi.clearAllMocks();
  });

  it('should execute valid builtin command', async () => {
    const result = await executeBuiltinCommand('help', [], context);
    expect(result.handled).toBe(true);
    expect(result.output).toBe('Help text');
  });

  it('should resolve command aliases', async () => {
    const result = await executeBuiltinCommand('h', [], context);
    expect(result.handled).toBe(true);
    expect(result.output).toBe('Help text');
  });

  it('should return error for unknown command', async () => {
    const result = await executeBuiltinCommand('unknown', [], context);
    expect(result.handled).toBe(false);
    expect(result.error).toContain('Unknown command');
  });

  it('should pass arguments to handler', async () => {
    const { handleConfig } = await import('../handlers');
    await executeBuiltinCommand('config', ['get', 'key'], context);
    expect(handleConfig).toHaveBeenCalledWith(['get', 'key'], context);
  });

  it('keeps extension-host NPC commands registered without executing NPC orchestration here', async () => {
    const result = await executeBuiltinCommand('as', ['@小橘'], context);

    expect(result).toEqual({
      handled: true,
      continueExecution: true,
      output: 'This command is handled by the VSCode extension host.',
    });
  });

  it('should catch and wrap handler errors', async () => {
    const { handleHelp } = await import('../handlers');
    vi.mocked(handleHelp).mockRejectedValueOnce(new Error('Handler failed'));

    const result = await executeBuiltinCommand('help', [], context);
    expect(result.handled).toBe(true);
    expect(result.error).toContain('Command failed: Handler failed');
  });

  it('should handle non-Error exceptions', async () => {
    const { handleHelp } = await import('../handlers');
    vi.mocked(handleHelp).mockRejectedValueOnce('String error');

    const result = await executeBuiltinCommand('help', [], context);
    expect(result.error).toContain('String error');
  });
});

describe('executeSlashCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createMockContext();
    vi.clearAllMocks();
  });

  it('should execute builtin command', async () => {
    const result = await executeSlashCommand('/help', context);
    expect(result.handled).toBe(true);
    expect(result.output).toBe('Help text');
  });

  it('should resolve skill commands from command catalog when registry exposes listAllSkills', async () => {
    const skill = {
      name: 'custom',
      command: 'custom',
      description: 'Custom skill command',
      enabled: true,
    };
    context = {
      ...context,
      skillService: {
        registry: {
          skillCount: 1,
          listSkills: vi.fn(() => [skill]),
          listAllSkills: vi.fn(() => [skill]),
          getSkill: vi.fn(() => skill),
          getSkillByCommand: vi.fn(() => skill),
          searchSkills: vi.fn(() => [skill]),
        },
        skillCount: 1,
        getActiveSkill: vi.fn(() => null),
        clearActiveSkill: vi.fn(),
      },
    } as unknown as CommandContext;

    const mockSkillService = {
      getSkillByCommand: vi.fn().mockReturnValue(undefined),
      apply: vi.fn().mockResolvedValue('catalog-test'),
    };

    const result = await executeSlashCommand('/custom arg', context, mockSkillService);
    expect(mockSkillService.getSkillByCommand).not.toHaveBeenCalled();
    expect(mockSkillService.apply).toHaveBeenCalledWith(skill, 'arg');
    expect(result.handled).toBe(true);
    expect(result.data?.injection).toBe('catalog-test');
  });

  it('should try user-defined command if builtin not found', async () => {
    const mockSkillService = {
      getSkillByCommand: vi.fn().mockReturnValue({ name: 'custom' }),
      apply: vi.fn().mockResolvedValue('test'),
    };

    const result = await executeSlashCommand('/custom arg', context, mockSkillService);
    expect(mockSkillService.getSkillByCommand).toHaveBeenCalledWith('custom');
    expect(mockSkillService.apply).toHaveBeenCalledWith({ name: 'custom' }, 'arg');
    expect(result.handled).toBe(true);
    expect(result.data?.injection).toBe('test');
  });

  it('should return error if user-defined command fails', async () => {
    const mockSkillService = {
      getSkillByCommand: vi.fn().mockReturnValue({ name: 'custom' }),
      apply: vi.fn().mockRejectedValue(new Error('Failed')),
    };

    const result = await executeSlashCommand('/custom', context, mockSkillService);
    expect(result.handled).toBe(true);
    expect(result.error).toContain('Failed');
  });

  it('should return error if command not found anywhere', async () => {
    const mockSkillService = {
      getSkillByCommand: vi.fn().mockReturnValue(undefined),
      apply: vi.fn(),
    };

    const result = await executeSlashCommand('/unknown', context, mockSkillService);
    expect(result.handled).toBe(false);
    expect(result.error).toContain('Unknown command: /unknown');
  });

  it('should work without skill service', async () => {
    const result = await executeSlashCommand('/help', context);
    expect(result.handled).toBe(true);
  });
});

describe('getCommandHandler', () => {
  it('should return handler for valid command', () => {
    const handler = getCommandHandler('help');
    expect(handler).toBeDefined();
  });

  it('should return handler for alias', () => {
    const handler = getCommandHandler('h');
    expect(handler).toBeDefined();
  });

  it('should return undefined for unknown command', () => {
    const handler = getCommandHandler('unknown');
    expect(handler).toBeUndefined();
  });

  it('should handle case-insensitive lookup', () => {
    const handler = getCommandHandler('HELP');
    expect(handler).toBeDefined();
  });
});
