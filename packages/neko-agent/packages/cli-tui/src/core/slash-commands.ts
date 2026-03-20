/**
 * Slash Command Handler
 *
 * Handles built-in slash commands for the CLI.
 * Uses shared command definitions from @neko/agent.
 */

import {
  type SkillService,
  type ToolRegistry,
  type CommandContext,
  type CommandResult,
  executeSlashCommand,
  isSlashCommand as checkIsSlashCommand,
  parseSlashCommand as parseCommand,
  getCliCommands,
} from '@neko/agent';
import type { CLIConfig } from './types';
import { listProviders, getProviderModels } from './config';

/**
 * Slash command result (CLI-specific)
 */
export interface SlashCommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Output to display */
  output?: string;
  /** Whether to continue with agent execution */
  continueExecution: boolean;
  /** Error message if any */
  error?: string;
}

/**
 * Slash command context (CLI-specific)
 */
export interface SlashCommandContext {
  config: CLIConfig;
  skillService?: SkillService;
  toolRegistry?: ToolRegistry;
  /** Callback to update config */
  onConfigUpdate?: (updates: Partial<CLIConfig>) => void;
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return checkIsSlashCommand(input);
}

/**
 * Parse slash command
 */
export function parseSlashCommand(input: string): { command: string; args: string[] } {
  return parseCommand(input);
}

/**
 * Convert CLI context to shared CommandContext
 */
function toCommandContext(context: SlashCommandContext): CommandContext {
  return {
    skillService: context.skillService
      ? {
          registry: {
            skillCount: context.skillService.skillCount,
            listSkills: () => context.skillService!.registry.listSkills() as unknown[],
            listAllSkills: () => context.skillService!.registry.listAllSkills() as unknown[],
            getSkill: (name: string) =>
              context.skillService!.registry.getSkill(name) as unknown | undefined,
            getSkillByCommand: (name: string) =>
              context.skillService!.registry.getSkillByCommand(name) as unknown | undefined,
            searchSkills: (keyword: string) =>
              context.skillService!.registry.searchSkills(keyword) as unknown[],
          },
          skillCount: context.skillService.skillCount,
          getActiveSkill: () => null,
          clearActiveSkill: () => {},
        }
      : undefined,
    toolRegistry: context.toolRegistry
      ? {
          size: context.toolRegistry.size,
          list: () => context.toolRegistry!.list() as unknown[],
          get: (name: string) => context.toolRegistry!.get(name) as unknown | undefined,
          search: (query: string) => {
            const tools = context.toolRegistry!.list();
            const q = query.toLowerCase();
            return tools.filter(
              (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
            ) as unknown[];
          },
        }
      : undefined,
    config: {
      provider: context.config.provider,
      model: context.config.model,
      apiKey: context.config.apiKey,
      baseUrl: context.config.baseUrl,
      maxTokens: context.config.maxTokens,
      temperature: context.config.temperature,
      workDir: context.config.workDir,
      skillsDir: context.config.skillsDir,
      outputFormat: context.config.outputFormat,
      verbose: context.config.verbose,
      mcpServers: context.config.mcpServers,
    },
  };
}

/**
 * Convert shared CommandResult to CLI SlashCommandResult
 */
function toSlashCommandResult(result: CommandResult): SlashCommandResult {
  return {
    handled: result.handled,
    output: result.output,
    continueExecution: result.continueExecution,
    error: result.error,
  };
}

/**
 * Handle slash command
 */
export async function handleSlashCommand(
  input: string,
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  const { command, args } = parseSlashCommand(input);

  // Handle CLI-specific config command with provider info
  if (command === 'config' || command === 'cfg') {
    return handleConfig(args, context);
  }

  // Use shared command executor for other commands
  const commandContext = toCommandContext(context);
  const result = await executeSlashCommand(
    input,
    commandContext,
    context.skillService
      ? {
          getSkillByCommand: (name: string) =>
            context.skillService!.registry.getSkillByCommand(name),
          apply: (skill: unknown, args?: string) => {
            return context.skillService!.apply(
              skill as Parameters<typeof context.skillService.apply>[0],
              args,
            );
          },
        }
      : undefined,
  );

  return toSlashCommandResult(result);
}

/**
 * Handle /config command (CLI-specific with provider info)
 */
function handleConfig(args: string[], context: SlashCommandContext): SlashCommandResult {
  const { config, onConfigUpdate } = context;

  if (args.length === 0) {
    // Show current config
    const apiKeyStatus = config.apiKey ? `***${config.apiKey.slice(-4)}` : '(not set)';

    const lines = [
      '',
      'Current Configuration:',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `  provider:     ${config.provider}`,
      `  model:        ${config.model}`,
      `  apiKey:       ${apiKeyStatus}`,
      `  baseUrl:      ${config.baseUrl ?? '(default)'}`,
      `  maxTokens:    ${config.maxTokens}`,
      `  temperature:  ${config.temperature}`,
      `  verbose:      ${config.verbose}`,
      `  outputFormat: ${config.outputFormat}`,
      '',
      'Use "/config set <key> <value>" to change a setting.',
      'Use "/config providers" to list available providers.',
      'Use "/config models" to list available models.',
      '',
    ];

    return { handled: true, output: lines.join('\n'), continueExecution: true };
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

      // Parse value based on key
      let parsedValue: string | number | boolean = value;
      if (key === 'maxTokens') {
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
          return {
            handled: true,
            continueExecution: true,
            error: 'maxTokens must be a number',
          };
        }
      } else if (key === 'temperature') {
        parsedValue = parseFloat(value);
        if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 2) {
          return {
            handled: true,
            continueExecution: true,
            error: 'temperature must be a number between 0 and 2',
          };
        }
      } else if (key === 'verbose') {
        parsedValue = value === 'true' || value === '1';
      }

      // Update config
      if (onConfigUpdate) {
        onConfigUpdate({ [key]: parsedValue } as Partial<CLIConfig>);
      }

      return {
        handled: true,
        output: `Set ${key} = ${parsedValue}`,
        continueExecution: true,
      };
    }

    case 'providers': {
      const providers = listProviders(config.workDir);
      const lines = ['', 'Available Providers:', ''];
      for (const p of providers) {
        const keyStatus = p.hasApiKey ? '✓' : '✗';
        lines.push(`  ${p.id} (${p.displayName})`);
        lines.push(`    Type: ${p.type}`);
        lines.push(`    API Key: ${keyStatus}`);
        lines.push(`    Models: ${p.models.length > 0 ? p.models.join(', ') : '(none)'}`);
        lines.push('');
      }
      return { handled: true, output: lines.join('\n'), continueExecution: true };
    }

    case 'models': {
      const models = getProviderModels(config.provider, config.workDir);
      if (models.length === 0) {
        return {
          handled: true,
          continueExecution: true,
          error: `No models configured for provider: ${config.provider}`,
        };
      }

      const lines = [
        '',
        `Available Models for ${config.provider}:`,
        '',
        ...models.map((m) => `  ${m === config.model ? '* ' : '  '}${m}`),
        '',
        '(* = current model)',
        '',
      ];
      return { handled: true, output: lines.join('\n'), continueExecution: true };
    }

    default:
      return {
        handled: true,
        continueExecution: true,
        error: `Unknown config subcommand: ${subcommand}. Use /config, /config set, /config providers, or /config models`,
      };
  }
}

/**
 * Get available CLI commands for help display
 */
export function getAvailableCommands(): string[] {
  return getCliCommands().map((cmd) => cmd.name);
}
