/**
 * useSlashCommands Hook
 *
 * Handles slash command execution in TUI context.
 * Reuses @neko/cli handleSlashCommand and adapts result to stores.
 */

import { useCallback } from 'react';
import {
  handleTUISkillInvocation,
  handleTUISlashCommand,
  isSkillInvocation,
  isSlashCommand,
} from '../adapters/slash-adapter';
import type { SkillService, ToolRegistry } from '@neko/agent';
import { useConfigStore } from '../stores/config-store';
import { useConversationStore } from '../stores/conversation-store';
import { useAgentStore } from '../stores/agent-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';
import { getProviderModels } from '../core/config';

export { isSlashCommand, isSkillInvocation };

interface SlashCommandHandlers {
  /** Handle a slash command input */
  handleCommand: (input: string) => Promise<void>;
  /** Clear conversation (for /clear) */
  onClear: () => void;
}

export function useSlashCommands(sessionActions: {
  clearHistory: () => void;
  submit?: (
    prompt: string,
    executionOverrides?: { metadata?: Record<string, unknown> },
  ) => Promise<void>;
  updateModel?: (model: string) => void;
  updateMode?: (mode: 'plan' | 'ask' | 'auto') => void;
  activateSkill?: (name: string, args?: string) => boolean | Promise<boolean>;
  deactivateSkill?: (input?: {
    readonly recordId?: string;
    readonly slot?: import('@neko/shared').SkillLifecycleSlot;
    readonly skillName?: string;
  }) => boolean | Promise<boolean>;
  getSkillService?: () => SkillService | undefined;
  getToolRegistry?: () => ToolRegistry | undefined;
}): SlashCommandHandlers {
  const handleCommand = useCallback(
    async (input: string) => {
      const config = useConfigStore.getState().config;

      if (isSkillInvocation(input)) {
        try {
          const result = await handleTUISkillInvocation(input, {
            config,
            skillService: sessionActions.getSkillService?.(),
            toolRegistry: sessionActions.getToolRegistry?.(),
            onConfigUpdate: (updates) => {
              useConfigStore.getState().setConfig(updates);
            },
            onOutput: (text) => {
              addSystemMessage(text);
            },
          });

          if (result.error) {
            useConversationStore.getState().addError(new Error(result.error));
          } else {
            const activation = result.lifecycleActivation;
            if (activation) {
              const ok =
                (await sessionActions.activateSkill?.(activation.skillName, activation.args)) ??
                false;
              if (!ok) {
                return;
              }
            }
          }

          if (result.agentPrompt && sessionActions.submit) {
            await sessionActions.submit(result.agentPrompt, result.executionOverrides);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          useConversationStore.getState().addError(new Error(`Skill invocation error: ${msg}`));
        }
        return;
      }

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

        case '/skill': {
          const skillArg = input.slice(6).trim();
          const skillService = sessionActions.getSkillService?.();

          if (!skillService) {
            addSystemMessage('No skills loaded. Configure skillsDir in your config.');
            return;
          }

          const skills = skillService.registry.listSkills().filter((s) => s.enabled !== false);

          if (skills.length === 0) {
            addSystemMessage('No skills available in skillsDir.');
            return;
          }

          // Deactivate: /skill off
          if (skillArg === 'off' || skillArg.startsWith('off ')) {
            const clearTarget = skillArg.slice(3).trim();
            const records = useAgentStore.getState().activeSkillLifecycleRecords;
            if (!clearTarget && records.length > 1) {
              addSystemMessage(
                `Multiple active Skill lifecycle records. Use /skill off <recordId|slot|skillName>. Active: ${records
                  .map((record) => `${record.id} ${record.skillName}[${record.slot}]`)
                  .join(', ')}`,
              );
              return;
            }
            const scopedTarget = parseSkillClearTarget(clearTarget, records);
            const ok = (await sessionActions.deactivateSkill?.(scopedTarget)) ?? false;
            if (ok) {
              addSystemMessage('Skill lifecycle record deactivated.');
            }
            return;
          }

          // Direct activate: /skill <name>
          if (skillArg) {
            const ok = (await sessionActions.activateSkill?.(skillArg)) ?? false;
            if (ok) {
              addSystemMessage(`Skill activated: ${skillArg}`);
            } else {
              addSystemMessage(`Skill not found: "${skillArg}". Use /skill to browse.`);
            }
            return;
          }

          // Interactive picker
          const activeSkillName = useAgentStore.getState().activeSkill;
          const items: SelectionMenuItem[] = [
            ...skills.map((s) => ({
              id: s.name,
              label: s.name,
              description: s.description ?? undefined,
              active: s.name === activeSkillName,
            })),
            { id: '__off__', label: '✕ Deactivate', description: 'Clear active skill' },
          ];

          const selectedId = await showSelection('Select Skill', items);
          if (!selectedId) return;

          if (selectedId === '__off__') {
            const ok = (await sessionActions.deactivateSkill?.()) ?? false;
            if (ok) {
              addSystemMessage('Skill lifecycle record deactivated.');
            }
          } else {
            const ok = (await sessionActions.activateSkill?.(selectedId)) ?? false;
            if (ok) {
              addSystemMessage(`Skill activated: ${selectedId}`);
            }
          }
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

        case '/plan':
          sessionActions.updateMode?.('plan');
          addSystemMessage('Plan mode enabled');
          return;

        case '/auto':
          sessionActions.updateMode?.('auto');
          addSystemMessage('Auto mode enabled');
          return;

        case '/ask':
          sessionActions.updateMode?.('ask');
          addSystemMessage('Ask mode enabled');
          return;

        default:
          break;
      }

      // Delegate to CLI slash command handler
      try {
        const result = await handleTUISlashCommand(input, {
          config,
          skillService: sessionActions.getSkillService?.(),
          toolRegistry: sessionActions.getToolRegistry?.(),
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
        } else {
          const activation = result.lifecycleActivation;
          if (activation) {
            const ok =
              (await sessionActions.activateSkill?.(activation.skillName, activation.args)) ??
              false;
            if (!ok) {
              return;
            }
          }
        }

        if (result.agentPrompt && sessionActions.submit) {
          await sessionActions.submit(result.agentPrompt, result.executionOverrides);
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

function parseSkillClearTarget(
  target: string,
  records: readonly import('@neko/shared').ActiveSkillLifecycleRecordProjection[],
):
  | {
      readonly recordId?: string;
      readonly slot?: import('@neko/shared').SkillLifecycleSlot;
      readonly skillName?: string;
    }
  | undefined {
  if (!target) {
    return undefined;
  }
  const slot = parseLifecycleSlot(target);
  if (slot) {
    return { slot };
  }
  if (records.some((record) => record.id === target)) {
    return { recordId: target };
  }
  return { skillName: target };
}

function parseLifecycleSlot(value: string): import('@neko/shared').SkillLifecycleSlot | null {
  switch (value) {
    case 'stagePersona':
    case 'domainSkill':
    case 'referenceSkill':
    case 'ephemeralSkill':
    case 'workflowSkill':
      return value;
    default:
      return null;
  }
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
