/**
 * useSlashCommands Hook
 *
 * Handles slash command execution in TUI context.
 * Reuses @neko/cli handleSlashCommand and adapts result to stores.
 */

import { useCallback } from 'react';
import { handleTUISlashCommand, isSlashCommand } from '../adapters/slash-adapter';
import { useConfigStore } from '../stores/config-store';
import { useConversationStore } from '../stores/conversation-store';
import { useAgentStore } from '../stores/agent-store';

export { isSlashCommand };

interface SlashCommandHandlers {
  /** Handle a slash command input */
  handleCommand: (input: string) => Promise<void>;
  /** Clear conversation (for /clear) */
  onClear: () => void;
}

export function useSlashCommands(sessionActions: {
  clearHistory: () => void;
}): SlashCommandHandlers {
  const handleCommand = useCallback(async (input: string) => {
    const config = useConfigStore.getState().config;

    // Built-in TUI commands that don't delegate to CLI
    const cmd = input.split(' ')[0]?.toLowerCase();

    switch (cmd) {
      case '/exit':
      case '/quit':
        process.exit(0);
        return;

      case '/clear':
        sessionActions.clearHistory();
        useConversationStore.getState().clearMessages();
        useConversationStore.getState().addUserMessage('[History cleared]');
        return;

      case '/plan':
        useAgentStore.getState().setExecutionMode('plan');
        addSystemMessage('Switched to plan mode');
        return;

      case '/auto':
        useAgentStore.getState().setExecutionMode('auto');
        addSystemMessage('Switched to auto mode');
        return;

      case '/ask':
        useAgentStore.getState().setExecutionMode('ask');
        addSystemMessage('Switched to ask mode');
        return;

      case '/status': {
        const status = useAgentStore.getState();
        const msg = [
          `Model: ${config.model}`,
          `Mode: ${status.executionMode}`,
          `Status: ${status.status}`,
          `Tokens: ${status.usage.total}`,
        ].join('\n');
        addSystemMessage(msg);
        return;
      }

      default:
        break;
    }

    // Delegate to CLI slash command handler
    try {
      const result = await handleTUISlashCommand(input, {
        config,
        onConfigUpdate: (updates) => {
          useConfigStore.getState().setConfig(updates);
        },
        onOutput: (text) => {
          addSystemMessage(text);
        },
      });

      if (!result.handled) {
        addSystemMessage(`Unknown command: ${input}. Type /help for available commands.`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addSystemMessage(`Command error: ${msg}`);
    }
  }, [sessionActions]);

  const onClear = useCallback(() => {
    sessionActions.clearHistory();
    useConversationStore.getState().clearMessages();
  }, [sessionActions]);

  return { handleCommand, onClear };
}

/** Add a system-level message to the conversation */
function addSystemMessage(text: string): void {
  // Use addError for system messages (shows in system color)
  useConversationStore.getState().addError(new Error(text));
}
