/**
 * Configuration Command Handlers
 *
 * Handlers for: config, model, settings, permissions, init
 */

import type { CommandHandler } from '../types';

/**
 * Handle /config command (CLI only)
 */
export const handleConfig: CommandHandler = (args, context) => {
  const { config } = context;

  if (args.length === 0) {
    // Show current configuration
    const lines = [
      '',
      'Current Configuration:',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `  provider:     ${config?.provider ?? '(not set)'}`,
      `  model:        ${config?.model ?? '(not set)'}`,
      `  maxTokens:    ${config?.maxTokens ?? '(default)'}`,
      `  temperature:  ${config?.temperature ?? '(default)'}`,
      `  verbose:      ${config?.verbose ?? false}`,
      `  outputFormat: ${config?.outputFormat ?? 'text'}`,
      '',
      'Use "/config set <key> <value>" to change a setting.',
      'Use "/config providers" to list available providers.',
      'Use "/config models" to list available models.',
      '',
    ];

    return {
      handled: true,
      continueExecution: true,
      output: lines.join('\n'),
    };
  }

  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'set': {
      const key = args[1];
      const value = args.slice(2).join(' ');

      if (!key || !value) {
        return {
          handled: true,
          continueExecution: true,
          error: 'Usage: /config set <key> <value>',
        };
      }

      const validKeys = [
        'provider',
        'model',
        'maxTokens',
        'temperature',
        'verbose',
        'outputFormat',
      ];
      if (!validKeys.includes(key)) {
        return {
          handled: true,
          continueExecution: true,
          error: `Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`,
        };
      }

      // Note: Actual config update would be done by the caller
      return {
        handled: true,
        continueExecution: true,
        output: `Configuration updated: ${key} = ${value}`,
        data: { key, value },
        action: 'showSettings',
      };
    }

    case 'providers':
      return {
        handled: true,
        continueExecution: true,
        output: 'Available providers: anthropic, openai, google, ollama, openrouter',
      };

    case 'models':
      return {
        handled: true,
        continueExecution: true,
        output: `Models for ${config?.provider ?? 'current provider'}:\n(Use provider API to list available models)`,
        action: 'showModelSelector',
      };

    default:
      return {
        handled: true,
        continueExecution: true,
        error: `Unknown subcommand: ${subcommand}. Use /config, /config set, /config providers, or /config models.`,
      };
  }
};

/**
 * Handle /model command (extension only)
 */
export const handleModel: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    action: 'showModelSelector',
  };
};

/**
 * Handle /settings command (extension only)
 */
export const handleSettings: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    action: 'showSettings',
  };
};

/**
 * Handle /permissions command (extension only)
 */
export const handlePermissions: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    action: 'showPermissions',
  };
};

/**
 * Handle /init command (extension only)
 */
export const handleInit: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    action: 'initProject',
    output: `**Project Initialization**

To initialize your project, you can:
1. Create a \`.neko/\` directory in your project root
2. Add skills in \`.neko/skills/\` directory
3. Add commands in \`.neko/commands/\` directory
4. Configure hooks in \`.neko/settings.json\`

Or use the Settings panel to configure providers and models.`,
  };
};
