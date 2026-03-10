/**
 * Config Handlers Tests
 *
 * Tests for configuration command handlers: config, model, settings, permissions, init
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleConfig,
  handleModel,
  handleSettings,
  handlePermissions,
  handleInit,
} from '../config-handlers';
import type { CommandContext } from '../../types';

// Mock context factory
function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    config: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.7,
      verbose: false,
      outputFormat: 'text',
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe('handleConfig', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('no arguments', () => {
    it('should show current configuration', () => {
      const result = handleConfig([], context);

      expect(result.handled).toBe(true);
      expect(result.continueExecution).toBe(true);
      expect(result.output).toContain('Current Configuration');
      expect(result.output).toContain('provider:     anthropic');
      expect(result.output).toContain('model:        claude-sonnet-4-6');
    });

    it('should show usage hints', () => {
      const result = handleConfig([], context);

      expect(result.output).toContain('/config set');
      expect(result.output).toContain('/config providers');
      expect(result.output).toContain('/config models');
    });

    it('should handle missing config gracefully', () => {
      const emptyContext = createMockContext({ config: undefined });
      const result = handleConfig([], emptyContext);

      expect(result.output).toContain('(not set)');
    });
  });

  describe('set subcommand', () => {
    it('should set configuration value', () => {
      const result = handleConfig(['set', 'model', 'claude-opus-4-6'], context);

      expect(result.handled).toBe(true);
      expect(result.output).toContain('Configuration updated');
      expect(result.output).toContain('model = claude-opus-4-6');
      expect(result.data).toEqual({ key: 'model', value: 'claude-opus-4-6' });
      expect(result.action).toBe('showSettings');
    });

    it('should handle multi-word values', () => {
      const result = handleConfig(['set', 'outputFormat', 'json pretty'], context);

      expect(result.data).toEqual({ key: 'outputFormat', value: 'json pretty' });
    });

    it('should return error if key is missing', () => {
      const result = handleConfig(['set'], context);

      expect(result.error).toContain('Usage: /config set <key> <value>');
    });

    it('should return error if value is missing', () => {
      const result = handleConfig(['set', 'model'], context);

      expect(result.error).toContain('Usage: /config set <key> <value>');
    });

    it('should validate key names', () => {
      const result = handleConfig(['set', 'invalidKey', 'value'], context);

      expect(result.error).toContain('Invalid key: invalidKey');
      expect(result.error).toContain('Valid keys:');
    });

    it('should accept all valid keys', () => {
      const validKeys = [
        'provider',
        'model',
        'maxTokens',
        'temperature',
        'verbose',
        'outputFormat',
      ];

      for (const key of validKeys) {
        const result = handleConfig(['set', key, 'test-value'], context);
        expect(result.error).toBeUndefined();
        expect(result.data?.key).toBe(key);
      }
    });

    it('should be case-insensitive for subcommand', () => {
      const result = handleConfig(['SET', 'model', 'test'], context);

      expect(result.data?.key).toBe('model');
    });
  });

  describe('providers subcommand', () => {
    it('should list available providers', () => {
      const result = handleConfig(['providers'], context);

      expect(result.handled).toBe(true);
      expect(result.output).toContain('anthropic');
      expect(result.output).toContain('openai');
      expect(result.output).toContain('google');
      expect(result.output).toContain('ollama');
      expect(result.output).toContain('openrouter');
    });

    it('should be case-insensitive', () => {
      const result = handleConfig(['PROVIDERS'], context);

      expect(result.output).toContain('Available providers');
    });
  });

  describe('models subcommand', () => {
    it('should show models command', () => {
      const result = handleConfig(['models'], context);

      expect(result.handled).toBe(true);
      expect(result.output).toContain('Models for');
      expect(result.action).toBe('showModelSelector');
    });

    it('should include current provider', () => {
      const result = handleConfig(['models'], context);

      expect(result.output).toContain('anthropic');
    });

    it('should handle missing provider', () => {
      const emptyContext = createMockContext({ config: undefined });
      const result = handleConfig(['models'], emptyContext);

      expect(result.output).toContain('current provider');
    });
  });

  describe('unknown subcommand', () => {
    it('should return error for unknown subcommand', () => {
      const result = handleConfig(['unknown'], context);

      expect(result.error).toContain('Unknown subcommand: unknown');
      expect(result.error).toContain('/config set');
    });
  });
});

describe('handleModel', () => {
  it('should trigger model selector', () => {
    const context = createMockContext();
    const result = handleModel([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.action).toBe('showModelSelector');
  });

  it('should work with empty context', () => {
    const result = handleModel([], {} as CommandContext);

    expect(result.handled).toBe(true);
  });
});

describe('handleSettings', () => {
  it('should trigger settings panel', () => {
    const context = createMockContext();
    const result = handleSettings([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.action).toBe('showSettings');
  });

  it('should work with empty context', () => {
    const result = handleSettings([], {} as CommandContext);

    expect(result.handled).toBe(true);
  });
});

describe('handlePermissions', () => {
  it('should trigger permissions panel', () => {
    const context = createMockContext();
    const result = handlePermissions([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.action).toBe('showPermissions');
  });

  it('should work with empty context', () => {
    const result = handlePermissions([], {} as CommandContext);

    expect(result.handled).toBe(true);
  });
});

describe('handleInit', () => {
  it('should show initialization instructions', () => {
    const context = createMockContext();
    const result = handleInit([], context);

    expect(result.handled).toBe(true);
    expect(result.continueExecution).toBe(true);
    expect(result.action).toBe('initProject');
    expect(result.output).toContain('Project Initialization');
  });

  it('should include directory structure', () => {
    const context = createMockContext();
    const result = handleInit([], context);

    expect(result.output).toContain('.neko/');
    expect(result.output).toContain('skills/');
    expect(result.output).toContain('commands/');
    expect(result.output).toContain('hooks/');
  });

  it('should work with empty context', () => {
    const result = handleInit([], {} as CommandContext);

    expect(result.handled).toBe(true);
  });
});
