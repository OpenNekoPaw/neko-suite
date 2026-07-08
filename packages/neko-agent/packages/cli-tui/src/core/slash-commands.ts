/**
 * Slash Command Handler
 *
 * Handles built-in slash commands for the CLI.
 * Uses shared command definitions from @neko/agent.
 */

import {
  type Skill,
  type SkillService,
  type ToolRegistry,
  type CommandContext,
  type CommandResult,
  type ChatMessage,
  createSkillExecutionCreationMetadata,
  executeSlashCommand,
  isSlashCommand as checkIsSlashCommand,
  parseSlashCommand as parseCommand,
  resolveSlashCommandCatalogEntry,
  getCliCommands,
  type FileConversationStorage,
  type ConversationRecord,
} from '@neko/agent';
import { parseAgentInputTrigger } from '@neko-agent/types';
import { handleMarketCommand } from '../commands/market';
import type { CLIConfig } from './types';
import { listProviders, getProviderModels } from './config';
import type { TuiLocale } from './tui-locale';

/** Per-category media model overrides for the current session */
export interface MediaModelOverrides {
  image?: string;
  video?: string;
  audio?: string;
}

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
  /** Prompt to continue into agent execution after command handling */
  agentPrompt?: string;
  /** Optional metadata overrides for AgentSession.execute() */
  executionOverrides?: {
    metadata?: Record<string, unknown>;
  };
  /** Lifecycle activation requested by an explicit Skill-backed slash command. */
  lifecycleActivation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}

export interface SkillInvocationResult {
  handled: boolean;
  output?: string;
  error?: string;
  agentPrompt?: string;
  executionOverrides?: {
    metadata?: Record<string, unknown>;
  };
  /** Lifecycle activation requested by an explicit `$skill` invocation. */
  lifecycleActivation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}

/**
 * Slash command context (CLI-specific)
 */
export interface SlashCommandContext {
  locale?: TuiLocale;
  config: CLIConfig;
  skillService?: SkillService;
  toolRegistry?: ToolRegistry;
  /** Callback to update config */
  onConfigUpdate?: (updates: Partial<CLIConfig>) => void;
  /** Conversation storage for /resume */
  conversationStorage?: FileConversationStorage;
  /** Current conversation ID */
  currentConversationId?: string;
  /** Load history into current session */
  onLoadHistory?: (
    messages: ChatMessage[],
    messageEventIds?: readonly (readonly string[])[],
  ) => void;
  /** Resume a full conversation record and switch the active runtime binding. */
  onResumeConversation?: (record: ConversationRecord) => void | Promise<void>;
  /** Get current session history */
  getHistory?: () => ChatMessage[];
  /** Update media model overrides and propagate to platform */
  onUpdateMediaOverrides?: (overrides: MediaModelOverrides) => void;
  /** Reset all media overrides to config defaults */
  onResetMediaOverrides?: () => void;
  /** Current media model overrides */
  currentMediaOverrides?: MediaModelOverrides;
  /** Available media model IDs from config */
  availableMediaModels?: string[];
  /** Default media models from config */
  defaultMediaModels?: { image?: string; video?: string; audio?: string };
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return checkIsSlashCommand(input);
}

export function isSkillInvocation(input: string): boolean {
  return parseDirectSkillInvocation(input) !== null;
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
    locale: context.locale,
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
  const argsText = args.join(' ').trim();

  // Handle CLI-specific config command with provider info
  if (command === 'config' || command === 'cfg') {
    return handleConfig(args, context);
  }

  // Conversation resume
  if (command === 'resume') {
    return handleResume(args, context);
  }

  // Conversation history
  if (command === 'history') {
    return handleHistory(context);
  }

  // Media model selection
  if (command === 'media') {
    return handleMedia(args, context);
  }

  // Marketplace management
  if (command === 'market') {
    return handleMarketCommand(args);
  }

  // Use shared command executor for other commands
  const commandEntry = resolveSlashCommandCatalogEntry(command, {
    surface: 'tui',
    skills: context.skillService?.registry.listAllSkills(),
    locale: context.locale,
  });
  const skill =
    commandEntry?.source === 'command-artifact' ? (commandEntry.skill as Skill) : undefined;
  if (skill) {
    return createCommandArtifactSlashResult(command, argsText, skill);
  }

  const commandContext = toCommandContext(context);
  const result = await executeSlashCommand(input, commandContext);

  return toSlashCommandResult(result);
}

function createCommandArtifactSlashResult(
  command: string,
  argsText: string,
  skill: Skill,
): SlashCommandResult {
  return {
    handled: true,
    continueExecution: true,
    output: `Skill /${command} activated`,
    ...(argsText
      ? {
          agentPrompt: argsText,
          executionOverrides: {
            metadata: createSkillExecutionCreationMetadata(skill),
          },
        }
      : {}),
    lifecycleActivation: {
      skillName: skill.name,
      ...(argsText ? { args: argsText } : {}),
    },
  };
}

export async function handleSkillInvocation(
  input: string,
  context: SlashCommandContext,
): Promise<SkillInvocationResult> {
  const parsed = parseDirectSkillInvocation(input);
  if (!parsed) {
    return { handled: false, error: `Invalid skill invocation: ${input}` };
  }

  const skillService = context.skillService;
  if (!skillService) {
    return { handled: true, error: 'SkillService not initialized' };
  }

  const skill = skillService.registry.getSkill(parsed.skillName);
  if (!skill) {
    return { handled: true, error: `Unknown skill: $${parsed.skillName}` };
  }
  if (skill.enabled === false) {
    return { handled: true, error: `Skill is disabled: $${parsed.skillName}` };
  }

  let loadedSkill: Skill | undefined;
  try {
    loadedSkill = await skillService.registry.ensureLoaded(parsed.skillName);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { handled: true, error: `Failed to load skill: $${parsed.skillName}: ${reason}` };
  }

  if (!loadedSkill) {
    return { handled: true, error: `Failed to load skill: $${parsed.skillName}` };
  }
  if (loadedSkill.enabled === false) {
    return { handled: true, error: `Skill is disabled: $${parsed.skillName}` };
  }
  if (!loadedSkill.content) {
    return { handled: true, error: `Skill has no content: $${parsed.skillName}` };
  }

  return {
    handled: true,
    output: `Skill activated: ${loadedSkill.name}`,
    lifecycleActivation: {
      skillName: loadedSkill.name,
      ...(parsed.args ? { args: parsed.args } : {}),
    },
    ...(parsed.args
      ? {
          agentPrompt: parsed.args,
          executionOverrides: {
            metadata: createSkillExecutionCreationMetadata(loadedSkill),
          },
        }
      : {}),
  };
}

function parseDirectSkillInvocation(
  input: string,
): { readonly skillName: string; readonly args?: string } | null {
  const parsed = parseAgentInputTrigger(input);
  if (!parsed || parsed.trigger !== 'skill') {
    return null;
  }
  return {
    skillName: parsed.name,
    ...(parsed.args ? { args: parsed.args } : {}),
  };
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
      `  maxOutputTokens: ${config.maxTokens}`,
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

// ============================================================================
// /resume — List and restore historical conversations
// ============================================================================

async function handleResume(
  args: string[],
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  const { conversationStorage, onLoadHistory, onResumeConversation } = context;
  if (!conversationStorage) {
    return { handled: true, continueExecution: true, error: 'Conversation storage not available' };
  }

  const targetId = args[0];

  if (targetId) {
    // Direct resume by ID
    const record = await conversationStorage.load(targetId).catch(() => undefined);
    if (!record) {
      return {
        handled: true,
        continueExecution: true,
        error: `Conversation "${targetId}" not found`,
      };
    }
    if (onResumeConversation) {
      await onResumeConversation(record);
    } else {
      onLoadHistory?.(record.messages, record.messageEventIds);
    }
    const resumedMessageCount = record.messages.filter(
      (message) => message.role !== 'system',
    ).length;
    return {
      handled: true,
      output: `Resumed: "${record.title}" (${resumedMessageCount} messages, ${new Date(record.updatedAt).toLocaleString()})`,
      continueExecution: true,
    };
  }

  // List available conversations
  const records = await conversationStorage.list().catch(() => []);
  if (records.length === 0) {
    return {
      handled: true,
      output: 'No saved conversations found for this workspace.',
      continueExecution: true,
    };
  }

  const lines = ['', 'Saved Conversations:', ''];
  records.slice(0, 20).forEach((r, i) => {
    const date = new Date(r.updatedAt).toLocaleDateString();
    const msgCount = r.messages.filter((message) => message.role !== 'system').length;
    const isCurrent = r.id === context.currentConversationId ? ' (current)' : '';
    lines.push(`  [${i + 1}] ${r.title}${isCurrent}`);
    lines.push(`      id: ${r.id} · ${date} · ${msgCount} messages`);
    lines.push('');
  });
  lines.push('Use "/resume <id>" to restore a conversation.');

  return { handled: true, output: lines.join('\n'), continueExecution: true };
}

// ============================================================================
// /history — Show turns in current session
// ============================================================================

function handleHistory(context: SlashCommandContext): SlashCommandResult {
  const { getHistory } = context;
  if (!getHistory) {
    return { handled: true, continueExecution: true, error: 'History not available' };
  }

  const messages = getHistory();
  const turns = messages.filter((m) => m.role !== 'system');

  if (turns.length === 0) {
    return {
      handled: true,
      output: 'No messages in current session.',
      continueExecution: true,
    };
  }

  const lines = ['', `Conversation History (${turns.length} messages):`, ''];
  turns.forEach((m, i) => {
    const role = m.role === 'user' ? 'You' : 'Assistant';
    const preview =
      typeof m.content === 'string'
        ? m.content.slice(0, 60) + (m.content.length > 60 ? '…' : '')
        : '[tool/structured]';
    lines.push(`  [${i + 1}] ${role}: ${preview}`);
  });
  lines.push('');

  return { handled: true, output: lines.join('\n'), continueExecution: true };
}

// ============================================================================
// /media — Per-category media model selection
// ============================================================================

type MediaCategory = 'image' | 'video' | 'audio';
const MEDIA_CATEGORIES: MediaCategory[] = ['image', 'video', 'audio'];

function handleMedia(args: string[], context: SlashCommandContext): SlashCommandResult {
  const {
    availableMediaModels = [],
    currentMediaOverrides = {},
    defaultMediaModels = {},
    onUpdateMediaOverrides,
    onResetMediaOverrides,
  } = context;

  if (args.length === 0) {
    // Show current status
    const lines = ['', 'Media Model Selection:', ''];
    for (const cat of MEDIA_CATEGORIES) {
      const override = currentMediaOverrides[cat];
      const def = defaultMediaModels[cat];
      const effective = override ?? def ?? '(none)';
      const source = override ? 'session override' : def ? 'config default' : 'not set';
      lines.push(`  ${cat}: ${effective} [${source}]`);
    }
    if (availableMediaModels.length > 0) {
      lines.push('', 'Available models:', '');
      for (const modelId of availableMediaModels) {
        lines.push(`  ${modelId}`);
      }
    }
    lines.push('', 'Usage: /media <category> [model-id|none]  |  /media reset');
    return { handled: true, output: lines.join('\n'), continueExecution: true };
  }

  const subcommand = args[0]?.toLowerCase() as MediaCategory | 'reset';

  if (subcommand === 'reset') {
    onResetMediaOverrides?.();
    return {
      handled: true,
      output: 'Media model overrides reset to config defaults.',
      continueExecution: true,
    };
  }

  if (!MEDIA_CATEGORIES.includes(subcommand as MediaCategory)) {
    return {
      handled: true,
      continueExecution: true,
      error: `Unknown category: "${subcommand}". Valid: ${MEDIA_CATEGORIES.join(', ')}, reset`,
    };
  }

  const category = subcommand as MediaCategory;

  if (args.length === 1) {
    // List models for this category
    const modelsForCat = availableMediaModels.filter((id) => {
      // Heuristic: filter by category name substring; real implementation may use ChatModelOption
      return id.toLowerCase().includes(category) || availableMediaModels.length <= 5;
    });
    const current = currentMediaOverrides[category] ?? defaultMediaModels[category] ?? '(none)';
    const lines = ['', `${category} models (current: ${current}):`, ''];
    if (modelsForCat.length === 0) {
      lines.push('  (no models available for this category)');
    } else {
      for (const m of modelsForCat) {
        const marker = m === current ? '* ' : '  ';
        lines.push(`  ${marker}${m}`);
      }
    }
    lines.push('', 'Use "/media none" to disable this category.');
    return { handled: true, output: lines.join('\n'), continueExecution: true };
  }

  const modelId = args[1];
  if (modelId === 'none') {
    onUpdateMediaOverrides?.({ [category]: 'none' });
    return {
      handled: true,
      output: `${category} media generation disabled for this session.`,
      continueExecution: true,
    };
  }

  onUpdateMediaOverrides?.({ [category]: modelId });
  return {
    handled: true,
    output: `${category} model set to: ${modelId}`,
    continueExecution: true,
  };
}
