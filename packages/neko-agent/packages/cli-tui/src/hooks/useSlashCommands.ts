/**
 * useSlashCommands Hook
 *
 * Handles slash command execution in TUI context.
 * Reuses @neko/cli handleSlashCommand and adapts result to stores.
 */

import { useCallback } from 'react';
import { handleTUISlashCommand, isSlashCommand } from '../adapters/slash-adapter';
import type { SkillService, ToolRegistry } from '@neko/agent';
import { useConfigStore } from '../stores/config-store';
import { useConversationStore } from '../stores/conversation-store';
import { useAgentStore } from '../stores/agent-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';
import { getProviderModels } from '../core/config';

export { isSlashCommand };

interface SlashCommandHandlers {
  /** Handle a slash command input */
  handleCommand: (input: string) => Promise<void>;
  /** Clear conversation (for /clear) */
  onClear: () => void;
}

export function useSlashCommands(sessionActions: {
  clearHistory: () => void;
  updateModel?: (model: string) => void;
  skillService?: SkillService;
  toolRegistry?: ToolRegistry;
}): SlashCommandHandlers {
  const handleCommand = useCallback(
    async (input: string) => {
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

        case '/model': {
          const modelArg = input.slice(6).trim();
          if (modelArg) {
            // Direct switch: /model <name>
            if (sessionActions.updateModel) {
              sessionActions.updateModel(modelArg);
            }
            addSystemMessage(`Model switched to: ${modelArg}`);
            return;
          }

          // Build category menu — skip empty categories
          const chatModels = getProviderModels(config.provider, config.workDir);
          if (!chatModels.includes(config.model)) {
            chatModels.unshift(config.model);
          }
          const mediaModels = config.mediaModels;

          const hasChatModels = chatModels.length > 0;
          const hasMediaModels = mediaModels.length > 0;

          // If only chat models, go directly to chat model selection
          if (hasChatModels && !hasMediaModels) {
            await showModelPicker(
              'Chat Model',
              chatModels,
              config.model,
              sessionActions.updateModel,
            );
            return;
          }

          // If both, show category picker first
          if (hasChatModels && hasMediaModels) {
            const categories: SelectionMenuItem[] = [
              { id: 'chat', label: 'Chat', description: config.model },
              { id: 'media', label: 'Media', description: mediaModels.join(', ') },
            ];
            const categoryId = await showSelection('Select Model Category', categories);
            if (!categoryId) return;

            if (categoryId === 'chat') {
              await showModelPicker(
                'Chat Model',
                chatModels,
                config.model,
                sessionActions.updateModel,
              );
            } else {
              await showModelPicker('Media Model', mediaModels, mediaModels[0] ?? '', undefined);
            }
            return;
          }

          // No models at all
          addSystemMessage('No models configured.');
          return;
        }

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
          skillService: sessionActions.skillService,
          toolRegistry: sessionActions.toolRegistry,
          onConfigUpdate: (updates) => {
            useConfigStore.getState().setConfig(updates);
          },
          onOutput: (text) => {
            addSystemMessage(text);
          },
        });

        if (!result.handled) {
          addSystemMessage(`Unknown command: ${input}. Type /help for available commands.`);
        } else if (result.error) {
          useConversationStore.getState().addError(new Error(result.error));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        useConversationStore.getState().addError(new Error(`Command error: ${msg}`));
      }
    },
    [sessionActions],
  );

  const onClear = useCallback(() => {
    sessionActions.clearHistory();
    useConversationStore.getState().clearMessages();
  }, [sessionActions]);

  return { handleCommand, onClear };
}

/** Add a system-level informational message to the conversation */
function addSystemMessage(text: string): void {
  useConversationStore.getState().addSystemMessage(text);
}

/** Show a selection menu and return the selected ID (or null if cancelled) */
function showSelection(title: string, items: SelectionMenuItem[]): Promise<string | null> {
  return new Promise((resolve) => {
    useUIStore.getState().showSelection({
      title,
      items,
      resolve: (selectedId) => {
        useUIStore.getState().dismissSelection();
        resolve(selectedId);
      },
    });
  });
}

/** Show a model picker, apply selection via updateModel callback */
async function showModelPicker(
  title: string,
  models: string[],
  currentModel: string,
  onSelect?: (model: string) => void,
): Promise<void> {
  const items: SelectionMenuItem[] = models.map((m) => ({
    id: m,
    label: m,
    active: m === currentModel,
  }));

  const selectedId = await showSelection(title, items);
  if (!selectedId) return;

  if (onSelect) {
    onSelect(selectedId);
  }
  addSystemMessage(`Model switched to: ${selectedId}`);
}
