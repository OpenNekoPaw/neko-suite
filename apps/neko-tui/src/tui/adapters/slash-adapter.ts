/**
 * Slash Command Adapter
 *
 * Bridges the Neko TUI slash command handler to the Ink context.
 * Reuses all existing command logic without duplication.
 */

import {
  isSlashCommand,
  isSkillInvocation,
  handleSkillInvocation,
  type SlashCommandContext,
} from '../core/slash-commands';
import type { CLIConfig } from '../core/types';
import type { SkillService, ToolRegistry } from '@neko/agent';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import { presentSkillCommand } from '../presentation/skill-presentation';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';

export { isSlashCommand, isSkillInvocation };

export interface TUISlashCommandContext {
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly config: CLIConfig;
  skillService?: SkillService;
  toolRegistry?: ToolRegistry;
  onConfigUpdate: (updates: Partial<CLIConfig>) => void;
  onOutput: (text: string) => void;
}

/**
 * Handle a direct Skill invocation in TUI context.
 * Projects semantic Skill outcomes through the canonical terminal Presenter.
 */
export async function handleTUISkillInvocation(
  input: string,
  context: TUISlashCommandContext,
): Promise<{
  handled: boolean;
  output?: string;
  error?: string;
  diagnosticCode?: string;
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
    locale: context.presentation.uiLocale,
    config: context.config,
    skillService: context.skillService,
    toolRegistry: context.toolRegistry,
    onConfigUpdate: context.onConfigUpdate,
  };

  const result = await handleSkillInvocation(input, cliContext);
  const projection = presentSkillCommand(result.semantic, context.presentation);
  const output = projection.kind === 'output' ? projection.output : undefined;
  const error = projection.kind === 'error' ? projection.error : undefined;
  const diagnosticCode = projection.kind === 'error' ? projection.diagnosticCode : undefined;

  if (output) {
    context.onOutput(output);
  }

  return {
    handled: result.handled,
    output,
    error,
    diagnosticCode,
    agentPrompt: result.agentPrompt,
    executionOverrides: result.executionOverrides,
    lifecycleActivation: result.lifecycleActivation,
  };
}
