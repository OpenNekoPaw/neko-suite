/**
 * Slash Command Adapter
 *
 * Bridges @neko/cli slash command handler to TUI context.
 * Reuses all existing command logic without duplication.
 */

import {
  isSlashCommand,
  handleSlashCommand,
  type SlashCommandContext,
} from '../core/slash-commands';
import type { CLIConfig } from '../core/types';

export { isSlashCommand };

export interface TUISlashCommandContext {
  readonly config: CLIConfig;
  onConfigUpdate: (updates: Partial<CLIConfig>) => void;
  onOutput: (text: string) => void;
}

/**
 * Handle a slash command in TUI context.
 * Adapts TUI context to CLI SlashCommandContext and delegates.
 */
export async function handleTUISlashCommand(
  input: string,
  context: TUISlashCommandContext
): Promise<{ handled: boolean; output?: string; error?: string }> {
  const cliContext: SlashCommandContext = {
    config: context.config,
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
  };
}
