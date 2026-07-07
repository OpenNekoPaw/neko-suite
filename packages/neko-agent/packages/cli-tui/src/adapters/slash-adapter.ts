/**
 * Slash Command Adapter
 *
 * Bridges @neko/cli slash command handler to TUI context.
 * Reuses all existing command logic without duplication.
 */

import {
  isSlashCommand,
  isSkillInvocation,
  handleSlashCommand,
  handleSkillInvocation,
  type SlashCommandContext,
} from '../core/slash-commands';
import type { CLIConfig } from '../core/types';
import type { SkillService, ToolRegistry } from '@neko/agent';
import type { TuiLocale } from '../core/tui-locale';

export { isSlashCommand, isSkillInvocation };

export interface TUISlashCommandContext {
  readonly locale?: TuiLocale;
  readonly config: CLIConfig;
  skillService?: SkillService;
  toolRegistry?: ToolRegistry;
  onConfigUpdate: (updates: Partial<CLIConfig>) => void;
  onOutput: (text: string) => void;
}

/**
 * Handle a slash command in TUI context.
 * Adapts TUI context to CLI SlashCommandContext and delegates.
 */
export async function handleTUISlashCommand(
  input: string,
  context: TUISlashCommandContext,
): Promise<{
  handled: boolean;
  output?: string;
  error?: string;
  agentPrompt?: string;
  executionOverrides?: {
    metadata?: Record<string, unknown>;
  };
  lifecycleActivation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}> {
  const cliContext: SlashCommandContext = {
    locale: context.locale,
    config: context.config,
    skillService: context.skillService,
    toolRegistry: context.toolRegistry,
    onConfigUpdate: context.onConfigUpdate,
  };

  const result = await handleSlashCommand(input, cliContext);

  if (result.output) {
    context.onOutput(result.output);
  }

  return {
    handled: result.handled,
    output: result.output,
    error: result.error,
    agentPrompt: result.agentPrompt,
    executionOverrides: result.executionOverrides,
    lifecycleActivation: result.lifecycleActivation,
  };
}

export async function handleTUISkillInvocation(
  input: string,
  context: TUISlashCommandContext,
): Promise<{
  handled: boolean;
  output?: string;
  error?: string;
  agentPrompt?: string;
  executionOverrides?: {
    metadata?: Record<string, unknown>;
  };
  lifecycleActivation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}> {
  const cliContext: SlashCommandContext = {
    locale: context.locale,
    config: context.config,
    skillService: context.skillService,
    toolRegistry: context.toolRegistry,
    onConfigUpdate: context.onConfigUpdate,
  };

  const result = await handleSkillInvocation(input, cliContext);

  if (result.output) {
    context.onOutput(result.output);
  }

  return {
    handled: result.handled,
    output: result.output,
    error: result.error,
    agentPrompt: result.agentPrompt,
    executionOverrides: result.executionOverrides,
    lifecycleActivation: result.lifecycleActivation,
  };
}
