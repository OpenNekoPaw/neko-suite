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
  type ConversationResumeStorage,
  type ConversationRecord,
} from '@neko/agent';
import { parseAgentInputTrigger } from '@neko-agent/types';
import type { CLIConfig } from './types';
import type { SkillSemanticResult } from '../presentation/skill-presentation';
import type { SupportedLocale } from '@neko/shared/i18n';

/** Per-category media model overrides for the current session */

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
  /** Stable expected-diagnostic identity, independent of the selected UI locale. */
  diagnosticCode?: string;
  /** Skill activation semantics projected by the owning terminal Presenter. */
  skillSemantic?: SkillSemanticResult;
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
  readonly handled: boolean;
  readonly semantic: SkillSemanticResult;
  readonly agentPrompt?: string;
  readonly executionOverrides?: {
    readonly metadata?: Record<string, unknown>;
  };
  readonly lifecycleActivation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}

/**
 * Slash command context (CLI-specific)
 */
export interface SlashCommandContext {
  locale: SupportedLocale;
  config: CLIConfig;
  skillService?: SkillService;
  toolRegistry?: ToolRegistry;
  /** Callback to update config */
  onConfigUpdate?: (updates: Partial<CLIConfig>) => void;
  /** Conversation storage for /resume */
  conversationStorage?: ConversationResumeStorage;
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
function parseSlashCommand(input: string): { command: string; args: string[] } {
  return parseCommand(input);
}

/**
 * Convert CLI context to shared CommandContext
 */
export function toCommandContext(context: SlashCommandContext): CommandContext {
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
    continueExecution: result.continueExecution,
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

  if (
    command === 'config' ||
    command === 'cfg' ||
    command === 'resume' ||
    command === 'history' ||
    command === 'market' ||
    command === 'help' ||
    command === 'h' ||
    command === 'skills' ||
    command === 'commands' ||
    command === 'cmds' ||
    command === 'tools'
  ) {
    return { handled: false, continueExecution: true };
  }

  // Use shared command executor for other commands
  const commandEntry = resolveSlashCommandCatalogEntry(command, {
    surface: 'tui',
    skills: context.skillService?.registry.listAllSkills(),
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
    skillSemantic: { kind: 'activated', skillName: `/${command}` },
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
    return { handled: false, semantic: { kind: 'invocation-invalid', input } };
  }

  const skillService = context.skillService;
  if (!skillService) {
    return { handled: true, semantic: { kind: 'service-unavailable' } };
  }

  const skill = skillService.registry.getSkill(parsed.skillName);
  if (!skill) {
    return { handled: true, semantic: { kind: 'not-found', skillName: parsed.skillName } };
  }
  if (skill.enabled === false) {
    return { handled: true, semantic: { kind: 'disabled', skillName: parsed.skillName } };
  }

  let loadedSkill: Skill | undefined;
  try {
    loadedSkill = await skillService.registry.ensureLoaded(parsed.skillName);
  } catch (error) {
    return {
      handled: true,
      semantic: {
        kind: 'load-failed',
        skillName: parsed.skillName,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (!loadedSkill) {
    return { handled: true, semantic: { kind: 'load-failed', skillName: parsed.skillName } };
  }
  if (loadedSkill.enabled === false) {
    return { handled: true, semantic: { kind: 'disabled', skillName: parsed.skillName } };
  }
  if (!loadedSkill.content) {
    return { handled: true, semantic: { kind: 'no-content', skillName: parsed.skillName } };
  }

  return {
    handled: true,
    semantic: { kind: 'activated', skillName: loadedSkill.name },
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
