/**
 * Core Command Handlers
 *
 * Handlers for: help, status, clear, exit
 */

import type { CommandHandler, CommandContext } from '../types';
import {
  coerceSlashCommandSkills,
  listSlashCommandCatalog,
  type SlashCommandCatalogEntry,
  type SlashCommandSkillLike,
} from '../command-catalog';
import { getExtensionCommands } from '../builtin-commands';

/**
 * Generate help text for CLI
 */
export function generateCliHelpText(context?: CommandContext): string {
  const commands = listSlashCommandCatalog({
    surface: 'cli',
    skills: listContextSlashCommandSkills(context),
  });
  const builtinCommands = commands.filter(
    (entry): entry is Extract<SlashCommandCatalogEntry, { source: 'builtin' }> =>
      entry.source === 'builtin',
  );
  const skillCommands = commands.filter(
    (entry): entry is Extract<SlashCommandCatalogEntry, { source: 'skill' }> =>
      entry.source === 'skill',
  );
  const lines: string[] = [
    '',
    'Available Commands:',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  // Group by category
  const categories = new Map<string, typeof builtinCommands>();
  for (const cmd of builtinCommands) {
    const cat = cmd.category;
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(cmd);
  }

  // Format each category
  const categoryNames: Record<string, string> = {
    core: 'Core Commands',
    session: 'Session Management',
    configuration: 'Configuration',
    context: 'Context Management',
    mode: 'Mode Switching',
    resources: 'Resource Management',
  };

  for (const [category, cmds] of categories) {
    lines.push(`${categoryNames[category] || category}:`);
    for (const cmd of cmds) {
      const aliases = cmd.aliases ? `, /${cmd.aliases.join(', /')}` : '';
      const usage = cmd.usage ? ` ${cmd.usage}` : '';
      lines.push(`  /${cmd.name}${aliases}${usage}`);
      lines.push(`      ${cmd.description}`);
    }
    lines.push('');
  }

  if (skillCommands.length > 0) {
    lines.push('Skill Commands:');
    for (const command of skillCommands) {
      lines.push(`  /${command.name}${formatSkillUsage(command)}`);
      lines.push(`      ${command.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate help text for extension
 */
export function generateExtensionHelpText(skillCommands?: string[]): string {
  const commands = getExtensionCommands();
  const lines: string[] = ['**Available Commands:**\n'];

  // Group by category
  const categories = new Map<string, typeof commands>();
  for (const cmd of commands) {
    const cat = cmd.category;
    if (!categories.has(cat)) {
      categories.set(cat, []);
    }
    categories.get(cat)!.push(cmd);
  }

  // Format each category
  for (const [, cmds] of categories) {
    for (const cmd of cmds) {
      const aliases = cmd.aliases ? ` (${cmd.aliases.map((a) => `/${a}`).join(', ')})` : '';
      lines.push(`- \`/${cmd.name}\`${aliases} - ${cmd.description}`);
    }
  }

  // Add skill commands if provided
  if (skillCommands && skillCommands.length > 0) {
    lines.push('\n**Skill Commands:**');
    for (const cmd of skillCommands) {
      lines.push(`- \`${cmd}\``);
    }
  }

  lines.push('\n**Tips:**');
  lines.push('- Use `@` to reference files');
  lines.push('- Attach files using the 📎 button');
  lines.push('- Press Enter to send, Shift+Enter for new line');

  return lines.join('\n');
}

/**
 * Handle /help command
 */
export const handleHelp: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: true,
    output: generateCliHelpText(_context),
    action: 'showHelp',
  };
};

/**
 * Generate status text for CLI
 */
export function generateCliStatusText(context: CommandContext): string {
  const { config, skillService, toolRegistry } = context;

  const apiKeyStatus = config?.apiKey ? `***${config.apiKey.slice(-4)}` : '(not set)';

  const lines = [
    '',
    'Current Status',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Configuration:',
    `  Provider:     ${config?.provider ?? '(not set)'}`,
    `  Model:        ${config?.model ?? '(not set)'}`,
    `  API Key:      ${apiKeyStatus}`,
    `  Base URL:     ${config?.baseUrl ?? '(default)'}`,
    `  Max Tokens:   ${config?.maxTokens ?? '(default)'}`,
    `  Temperature:  ${config?.temperature ?? '(default)'}`,
    '',
    'Environment:',
    `  Work Dir:     ${config?.workDir ?? '(not set)'}`,
    `  Skills Dir:   ${config?.skillsDir ?? '(not set)'}`,
    `  Output:       ${config?.outputFormat ?? 'text'}`,
    `  Verbose:      ${config?.verbose ?? false}`,
    '',
    'Resources:',
    `  MCP Servers:  ${config?.mcpServers?.length ?? 0}`,
    `  Skills:       ${skillService?.skillCount ?? 0}`,
    `  Tools:        ${toolRegistry?.size ?? 0}`,
    '',
  ];

  // Show active skill if any
  if (skillService) {
    const activeSkill = skillService.getActiveSkill();
    if (activeSkill) {
      lines.push(`Active Skill:   ${activeSkill.name}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate status data for extension
 */
export function generateExtensionStatusData(context: CommandContext): Record<string, unknown> {
  const { config, skillService, conversations, planMode, contextManager } = context;

  const activeConversationId = conversations?.getActiveId();
  const tokenCount =
    activeConversationId && contextManager ? contextManager.getTokenCount(activeConversationId) : 0;

  return {
    provider: config?.provider,
    model: config?.model,
    conversationCount: conversations?.list().length ?? 0,
    activeConversationId,
    messageCount: 0, // Would need conversation manager to get this
    tokenCount,
    activeSkill: skillService?.getActiveSkill()?.name,
    planMode: planMode?.isEnabled() ?? false,
    executionMode: 'normal', // Would need settings to get this
  };
}

/**
 * Handle /status command
 */
export const handleStatus: CommandHandler = (_args, context) => {
  return {
    handled: true,
    continueExecution: true,
    output: generateCliStatusText(context),
    action: 'showStatus',
    data: generateExtensionStatusData(context),
  };
};

/**
 * Handle /clear command
 */
export const handleClear: CommandHandler = (_args, context) => {
  // For CLI: clear screen using ANSI escape codes
  // For extension: clear conversation history
  if (context.conversations) {
    context.conversations.clearCurrent();
  }

  return {
    handled: true,
    continueExecution: true,
    output: '\x1B[2J\x1B[0f', // ANSI clear screen for CLI
    action: 'clearHistory',
  };
};

/**
 * Handle /exit command
 */
export const handleExit: CommandHandler = (_args, _context) => {
  return {
    handled: true,
    continueExecution: false, // Signal to exit
    output: 'Goodbye!',
    action: 'exit',
  };
};

function listContextSlashCommandSkills(context?: CommandContext): SlashCommandSkillLike[] {
  const listAllSkills = context?.skillService?.registry.listAllSkills;
  if (typeof listAllSkills !== 'function') {
    return [];
  }

  return coerceSlashCommandSkills(listAllSkills());
}

function formatSkillUsage(entry: Extract<SlashCommandCatalogEntry, { source: 'skill' }>): string {
  if (!entry.supportsArguments) {
    return '';
  }

  return entry.argumentHint ? ` ${entry.argumentHint}` : ' <args>';
}
