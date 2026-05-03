/**
 * Builtin Command Types
 *
 * Defines interfaces for builtin slash commands that are shared
 * between cli and extension.
 */

import type { BuiltinSlashCommandCategory, BuiltinSlashCommandName } from '@neko-agent/types';
import { BUILTIN_SLASH_COMMAND_ALIASES } from '@neko-agent/types';

/**
 * Builtin command names
 */
export type BuiltinCommandName = BuiltinSlashCommandName;

/**
 * Command aliases mapping
 */
export const COMMAND_ALIASES: Record<string, BuiltinCommandName> = BUILTIN_SLASH_COMMAND_ALIASES;

/**
 * Resolve command name from input (handles aliases)
 */
export function resolveCommandName(input: string): BuiltinCommandName | string {
  const normalized = input.toLowerCase();
  return COMMAND_ALIASES[normalized] ?? normalized;
}

/**
 * Builtin command definition
 */
export interface BuiltinCommand {
  /** Command name (without /) */
  name: BuiltinCommandName;
  /** Command aliases */
  aliases?: string[];
  /** Description for help text */
  description: string;
  /** Usage hint (e.g., "[key] [value]") */
  usage?: string;
  /** Category for grouping in help */
  category: CommandCategory;
  /** Whether this command is available in CLI */
  availableInCli: boolean;
  /** Whether this command is available in extension */
  availableInExtension: boolean;
}

/**
 * Command categories for help grouping
 */
export type CommandCategory = BuiltinSlashCommandCategory;

/**
 * Command execution context - provides access to services and state
 */
export interface CommandContext {
  /** Skill service for skill management */
  skillService?: {
    /** Skill registry */
    registry: {
      skillCount: number;
      listSkills(): unknown[];
      listAllSkills(): unknown[];
      getSkill(name: string): unknown | undefined;
      getSkillByCommand(name: string): unknown | undefined;
      searchSkills(keyword: string): unknown[];
    };
    /** Number of registered skills */
    skillCount: number;
    /** Get currently active skill */
    getActiveSkill(): { name: string } | null;
    /** Clear active skill */
    clearActiveSkill(): void;
  };
  /** Tool registry for tool management */
  toolRegistry?: {
    size: number;
    list(): unknown[];
    get(name: string): unknown | undefined;
    search(query: string): unknown[];
  };
  /** Configuration */
  config?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    workDir?: string;
    skillsDir?: string;
    outputFormat?: string;
    verbose?: boolean;
    mcpServers?: unknown[];
    executionMode?: string;
  };
  /** Conversation management (extension only) */
  conversations?: {
    list(): Array<{ id: string; title: string }>;
    getActiveId(): string | null;
    getActiveMessageCount?(): number;
    create(): string;
    clearCurrent(): void;
  };
  /** Plan mode management (extension only) */
  planMode?: {
    isEnabled(): boolean;
    toggle(): boolean;
  };
  /** Context compression (extension only) */
  contextManager?: {
    getTokenCount(conversationId: string): number;
    compress(conversationId: string): Promise<void>;
  };
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Whether to continue execution (false = exit for CLI) */
  continueExecution: boolean;
  /** Output message to display */
  output?: string;
  /** Action for UI to perform (extension only) */
  action?: CommandAction;
  /** Additional data for the action */
  data?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

/**
 * UI actions that can be triggered by commands
 */
export type CommandAction =
  | 'exit'
  | 'showHelp'
  | 'showStatus'
  | 'showSettings'
  | 'showModelSelector'
  | 'showMCPServers'
  | 'showPermissions'
  | 'showTasks'
  | 'togglePlanMode'
  | 'initProject'
  | 'resumeConversation'
  | 'newConversation'
  | 'clearHistory'
  | 'compressContext';

// =============================================================================
// Type-Safe Command Action Data
// =============================================================================

/**
 * Conversation info for resume command
 */
export interface ConversationInfo {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt?: number;
}

/**
 * Status data returned by status command
 */
export interface StatusData {
  provider?: string;
  model?: string;
  conversationCount?: number;
  messageCount?: number;
  tokenCount?: number;
  activeSkill?: string;
  planMode?: boolean;
  executionMode?: string;
  mcpServerCount?: number;
  toolCount?: number;
  skillCount?: number;
}

/**
 * Type-safe mapping of command actions to their data types
 *
 * Use with CommandResultBuilder for type-safe result construction.
 */
export interface CommandActionDataMap {
  exit: undefined;
  showHelp: undefined;
  showStatus: StatusData;
  showSettings: undefined;
  showModelSelector: undefined;
  showMCPServers: undefined;
  showPermissions: undefined;
  showTasks: undefined;
  togglePlanMode: { planMode: boolean };
  initProject: undefined;
  resumeConversation: { conversations: ConversationInfo[] };
  newConversation: { conversationId?: string };
  clearHistory: undefined;
  compressContext: { beforeTokens?: number; afterTokens?: number };
}

// =============================================================================
// Command Result Builder
// =============================================================================

/**
 * Type-safe builder for command results
 *
 * @example
 * ```typescript
 * // Simple success
 * return new CommandResultBuilder().success('Done!').build();
 *
 * // With action
 * return new CommandResultBuilder()
 *   .action('showStatus', { provider: 'anthropic', model: 'claude-3' })
 *   .build();
 *
 * // Exit command
 * return new CommandResultBuilder().exit('Goodbye!').build();
 *
 * // Error
 * return new CommandResultBuilder().error('Invalid argument').build();
 * ```
 */
export class CommandResultBuilder {
  private result: CommandResult = {
    handled: false,
    continueExecution: true,
  };

  /**
   * Mark command as successfully handled with optional output
   */
  success(output?: string): this {
    this.result.handled = true;
    if (output !== undefined) {
      this.result.output = output;
    }
    return this;
  }

  /**
   * Mark command as failed with error message
   */
  error(message: string): this {
    this.result.handled = true;
    this.result.error = message;
    return this;
  }

  /**
   * Set an action with type-safe data
   */
  action<T extends CommandAction>(action: T, data?: CommandActionDataMap[T]): this {
    this.result.handled = true;
    this.result.action = action;
    if (data !== undefined) {
      this.result.data = data as Record<string, unknown>;
    }
    return this;
  }

  /**
   * Exit the CLI/session with optional message
   */
  exit(message?: string): this {
    this.result.handled = true;
    this.result.continueExecution = false;
    this.result.action = 'exit';
    if (message) {
      this.result.output = message;
    }
    return this;
  }

  /**
   * Mark as not handled (pass to next handler)
   */
  notHandled(): this {
    this.result.handled = false;
    return this;
  }

  /**
   * Set output message
   */
  output(message: string): this {
    this.result.output = message;
    return this;
  }

  /**
   * Set additional data
   */
  data(data: Record<string, unknown>): this {
    this.result.data = data;
    return this;
  }

  /**
   * Build and return the result
   */
  build(): CommandResult {
    return { ...this.result };
  }
}

/**
 * Factory function for creating CommandResultBuilder
 */
export function commandResult(): CommandResultBuilder {
  return new CommandResultBuilder();
}

/**
 * Command handler function signature
 */
export type CommandHandler = (
  args: string[],
  context: CommandContext,
) => CommandResult | Promise<CommandResult>;

/**
 * Command handler registration
 */
export interface CommandHandlerRegistration {
  command: BuiltinCommandName;
  handler: CommandHandler;
}
