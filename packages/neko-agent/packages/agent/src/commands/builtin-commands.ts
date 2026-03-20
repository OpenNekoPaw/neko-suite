/**
 * Builtin Commands Definition
 *
 * Defines all builtin slash commands available in the system.
 * These commands are shared between cli and extension.
 */

import type { BuiltinCommand } from './types';

/**
 * All builtin commands
 */
export const BUILTIN_COMMANDS: BuiltinCommand[] = [
  // ============================================================================
  // Core Commands
  // ============================================================================
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show help message with available commands',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'status',
    aliases: ['s'],
    description: 'Show current status (config, model, resources)',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear conversation history / screen',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit interactive mode / close current session',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },

  // ============================================================================
  // Session Management
  // ============================================================================
  {
    name: 'new',
    description: 'Start a new conversation',
    category: 'session',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'resume',
    description: 'Show recent conversations to resume',
    category: 'session',
    availableInCli: true,
    availableInExtension: true,
  },

  // ============================================================================
  // Configuration
  // ============================================================================
  {
    name: 'config',
    aliases: ['cfg'],
    description: 'Manage configuration',
    usage: '[set <key> <value> | providers | models]',
    category: 'configuration',
    availableInCli: true,
    availableInExtension: false,
  },
  {
    name: 'model',
    description: 'Show model selector / switch model',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'settings',
    description: 'Open settings panel',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'permissions',
    description: 'Show and manage permissions',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'init',
    description: 'Initialize project configuration',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },

  // ============================================================================
  // Context Management
  // ============================================================================
  {
    name: 'compact',
    description: 'Compress conversation context to save tokens',
    category: 'context',
    availableInCli: true,
    availableInExtension: true,
  },

  // ============================================================================
  // Mode Switching
  // ============================================================================
  {
    name: 'plan',
    description: 'Toggle plan mode (design before implement)',
    category: 'mode',
    availableInCli: true,
    availableInExtension: true,
  },

  // ============================================================================
  // Resource Management
  // ============================================================================
  {
    name: 'skills',
    description: 'List and manage skills',
    usage: '[info <name> | active | clear]',
    category: 'resources',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'commands',
    aliases: ['cmds'],
    description: 'List available slash commands',
    category: 'resources',
    availableInCli: true,
    availableInExtension: false,
  },
  {
    name: 'tools',
    description: 'List and search available tools',
    usage: '[info <name> | search <query>]',
    category: 'resources',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'tasks',
    aliases: ['todos'],
    description: 'Show background tasks',
    category: 'resources',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'mcp',
    description: 'Show MCP servers configuration',
    category: 'resources',
    availableInCli: false,
    availableInExtension: true,
  },
];

/**
 * Get builtin commands for CLI
 */
export function getCliCommands(): BuiltinCommand[] {
  return BUILTIN_COMMANDS.filter((cmd) => cmd.availableInCli);
}

/**
 * Get builtin commands for extension
 */
export function getExtensionCommands(): BuiltinCommand[] {
  return BUILTIN_COMMANDS.filter((cmd) => cmd.availableInExtension);
}

/**
 * Get command by name (including aliases)
 */
export function getBuiltinCommand(name: string): BuiltinCommand | undefined {
  const normalized = name.toLowerCase();
  return BUILTIN_COMMANDS.find(
    (cmd) => cmd.name === normalized || cmd.aliases?.includes(normalized),
  );
}

/**
 * Check if a command name is a builtin command
 */
export function isBuiltinCommand(name: string): boolean {
  return getBuiltinCommand(name) !== undefined;
}

/**
 * Get all command names including aliases
 */
export function getAllCommandNames(): string[] {
  const names: string[] = [];
  for (const cmd of BUILTIN_COMMANDS) {
    names.push(cmd.name);
    if (cmd.aliases) {
      names.push(...cmd.aliases);
    }
  }
  return names;
}
