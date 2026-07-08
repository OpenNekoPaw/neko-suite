/**
 * useSlashCommands Hook
 *
 * Adapts Ink/Zustand state to the package-local TUI command router.
 */

import { useCallback } from 'react';
import type {
  ChatMessage,
  CompressionResult,
  ConversationRecord,
  FileConversationStorage,
  SkillService,
  ToolRegistry,
} from '@neko/agent';
import type { ActiveSkillLifecycleRecordProjection } from '@neko/shared';
import type { AgentLlmConfig } from '@neko-agent/types';
import {
  handleTUISkillInvocation,
  isSkillInvocation,
  isSlashCommand,
} from '../adapters/slash-adapter';
import { getProviderModels, listChatModelOptions } from '../core/config';
import {
  handleTuiControlCommand,
  type TuiCommandRouterContext,
  type TuiCommandRouterResult,
  type TuiSkillOption,
  type TuiSkillClearTarget,
  type TuiModelIdentity,
  type TuiMcpPorts,
  type TuiCapabilityPorts,
} from '../core/tui-command-router';
import { detectTuiLocale } from '../core/tui-locale';
import { TuiMessageQueueError, formatTuiQueueError } from '../core/message-queue';
import { useAgentStore } from '../stores/agent-store';
import { useConfigStore } from '../stores/config-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';

export { isSlashCommand, isSkillInvocation };

interface SlashCommandHandlers {
  /** Handle a slash command input */
  handleCommand: (input: string) => Promise<void>;
  /** Clear conversation (for /clear) */
  onClear: () => void;
}

interface SlashCommandSessionActions {
  clearHistory: () => void;
  submit?: (
    prompt: string,
    executionOverrides?: { metadata?: Record<string, unknown> },
  ) => Promise<void>;
  updateModel?: (model: string | TuiModelIdentity) => void;
  updateMode?: (mode: 'plan' | 'ask' | 'auto') => void;
  validateLlmConfig?: AgentSessionHandleParameterValidator;
  applyLlmConfig?: AgentSessionHandleParameterApplier;
  getContextTokenCount?: () => number | null;
  compactContext?: () => Promise<CompressionResult>;
  getMessageQueueSnapshot?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['getMessageQueueSnapshot']
  >;
  promoteQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['promoteQueuedMessage']
  >;
  cancelQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['cancelQueuedMessage']
  >;
  editQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['editQueuedMessage']
  >;
  activateSkill?: (name: string, args?: string) => boolean | Promise<boolean>;
  deactivateSkill?: (input?: TuiSkillClearTarget) => boolean | Promise<boolean>;
  getSkillService?: () => SkillService | undefined;
  getToolRegistry?: () => ToolRegistry | undefined;
  listMcpServers?: TuiMcpPorts['listServers'];
  listMcpTools?: NonNullable<TuiMcpPorts['listTools']>;
  connectMcpServer?: NonNullable<TuiMcpPorts['connect']>;
  disconnectMcpServer?: NonNullable<TuiMcpPorts['disconnect']>;
  reconnectMcpServer?: NonNullable<TuiMcpPorts['reconnect']>;
  getCapabilityProviderSummaries?: TuiCapabilityPorts['getProviderSummaries'];
  getCapabilityDiagnostics?: TuiCapabilityPorts['getDiagnostics'];
  listCapabilityTools?: TuiCapabilityPorts['listTools'];
  getConversationStorage?: () => FileConversationStorage | undefined;
  getCurrentConversationId?: () => string;
  resumeConversation?: (record: ConversationRecord) => Promise<void>;
  getHistory?: () => ChatMessage[];
  syncRuntimeState?: () => void;
}

type AgentSessionHandleParameterValidator = NonNullable<
  import('./useAgentSession').AgentSessionHandle['validateLlmConfig']
>;
type AgentSessionHandleParameterApplier = NonNullable<
  import('./useAgentSession').AgentSessionHandle['applyLlmConfig']
>;

export function useSlashCommands(sessionActions: SlashCommandSessionActions): SlashCommandHandlers {
  const handleCommand = useCallback(
    async (input: string) => {
      if (isAgentRunning() && !isAllowedRunningCommand(input)) {
        const error = isSkillInvocation(input)
          ? new TuiMessageQueueError(
              'not-queueable',
              'Skill invocations cannot be queued while an Agent turn is running.',
            )
          : new TuiMessageQueueError(
              'not-queueable',
              'Commands cannot be queued while an Agent turn is running.',
            );
        const message = formatTuiQueueError(error);
        useAgentStore.getState().setMessageQueueDiagnostic(message);
        useConversationStore.getState().addError(new Error(message));
        return;
      }

      if (isSkillInvocation(input)) {
        await handleSkillInvocationCommand(input, sessionActions);
        return;
      }

      try {
        const result = await handleTuiControlCommand(input, createInkRouterContext(sessionActions));

        if (!result.handled) {
          addSystemMessage(`Unknown command: ${input}. Type /help for available commands.`);
          return;
        }

        await projectCommandResult(result, sessionActions);
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

function isAgentRunning(): boolean {
  const status = useAgentStore.getState().status;
  return status === 'running' || status === 'waiting_confirmation';
}

function isAllowedRunningCommand(input: string): boolean {
  if (!isSlashCommand(input)) {
    return false;
  }
  const commandName = input.trim().split(/\s+/)[0]?.slice(1).toLowerCase();
  if (commandName === 'queue' || commandName === 'status' || commandName === 's') {
    return true;
  }
  return false;
}

async function handleSkillInvocationCommand(
  input: string,
  sessionActions: SlashCommandSessionActions,
): Promise<void> {
  const config = useConfigStore.getState().config;
  try {
    const result = await handleTUISkillInvocation(input, {
      config,
      skillService: sessionActions.getSkillService?.(),
      toolRegistry: sessionActions.getToolRegistry?.(),
      onConfigUpdate: (updates) => {
        useConfigStore.getState().setConfig(updates);
      },
      onOutput: addSystemMessage,
    });

    if (result.error) {
      useConversationStore.getState().addError(new Error(result.error));
      return;
    }

    const activation = result.lifecycleActivation;
    if (activation) {
      const ok =
        (await sessionActions.activateSkill?.(activation.skillName, activation.args)) ?? false;
      if (!ok) {
        return;
      }
    }

    if (result.agentPrompt && sessionActions.submit) {
      await sessionActions.submit(result.agentPrompt, result.executionOverrides);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    useConversationStore.getState().addError(new Error(`Skill invocation error: ${msg}`));
  }
}

function createInkRouterContext(
  sessionActions: SlashCommandSessionActions,
): TuiCommandRouterContext {
  const config = useConfigStore.getState().config;
  return {
      slash: {
        locale: detectTuiLocale(),
        config,
        skillService: sessionActions.getSkillService?.(),
        toolRegistry: sessionActions.getToolRegistry?.(),
        conversationStorage: sessionActions.getConversationStorage?.(),
        currentConversationId: sessionActions.getCurrentConversationId?.(),
        onResumeConversation: sessionActions.resumeConversation,
        getHistory: sessionActions.getHistory,
        onConfigUpdate: (updates) => {
          useConfigStore.getState().setConfig(updates);
          sessionActions.syncRuntimeState?.();
        },
    },
    ports: {
      output: {
        info: addSystemMessage,
        error: (message) => useConversationStore.getState().addError(new Error(message)),
      },
      lifecycle: {
        exit: () => process.exit(0),
      },
      history: {
        clear: () => {
          sessionActions.clearHistory();
          useConversationStore.getState().clearMessages();
          useConversationStore.getState().addUserMessage('[History cleared]');
        },
      },
      mode: {
        getSessionMode: () => useAgentStore.getState().sessionMode,
        setSessionMode: (mode) => {
          useAgentStore.getState().setSessionMode(mode);
          sessionActions.syncRuntimeState?.();
          return `Session mode set to: ${mode}`;
        },
        setExecutionMode: (mode) => {
          sessionActions.updateMode?.(mode);
          return `${mode[0]?.toUpperCase()}${mode.slice(1)} mode enabled`;
        },
      },
      model: {
        listChatModelOptions: () => listChatModelOptions(useConfigStore.getState().config.workDir),
        listChatModels: () => {
          const currentConfig = useConfigStore.getState().config;
          return getProviderModels(currentConfig.provider, currentConfig.workDir);
        },
        selectChatModel: (model) => sessionActions.updateModel?.(model),
        selectMenuItem: (input) => showSelection(input.title, [...input.items]),
        selectModelFromMenu: (input) =>
          showModelPicker(input.title, [...input.models], input.currentModel),
      },
      media: {
        listMediaModelOptions: () =>
          listChatModelOptions(useConfigStore.getState().config.workDir).filter(
            (option) =>
              option.category === 'image' ||
              option.category === 'video' ||
              option.category === 'audio',
          ),
        getCurrentMediaModels: () => useConfigStore.getState().config.defaultMediaModels ?? {},
        setMediaModel: (category, model) => {
          const config = useConfigStore.getState().config;
          const current = config.defaultMediaModels ?? {};
          const nextValue =
            model === 'none' ? 'none' : (model.optionId ?? `${model.providerId}:${model.modelId}`);
          useConfigStore.getState().setConfig({
            defaultMediaModels: {
              ...current,
              [category]: nextValue,
            },
          });
          sessionActions.syncRuntimeState?.();
        },
        resetMediaModels: () => {
          useConfigStore.getState().setConfig({ defaultMediaModels: {} });
          sessionActions.syncRuntimeState?.();
        },
      },
      parameters: {
        getConfig: () => useConfigStore.getState().config.llmConfig,
        validate: (llmConfig) =>
          sessionActions.validateLlmConfig?.(llmConfig) ?? { config: llmConfig },
        apply: (result) => sessionActions.applyLlmConfig?.(result),
      },
      skill: {
        listEnabled: () => listEnabledSkills(sessionActions.getSkillService?.()),
        getActiveSkillName: () => useAgentStore.getState().activeSkill,
        getActiveRecords: () => useAgentStore.getState().activeSkillLifecycleRecords,
        activate: sessionActions.activateSkill,
        deactivate: sessionActions.deactivateSkill,
        selectSkillFromMenu: (input) => showSelection(input.title, [...input.items]),
      },
      context: {
        getTokenCount: () => {
          const count = sessionActions.getContextTokenCount?.();
          if (count === null || count === undefined) {
            throw new Error('Context token estimate unavailable');
          }
          return count;
        },
        compact: sessionActions.compactContext,
      },
      queue: sessionActions.getMessageQueueSnapshot
        ? {
            getSnapshot: () => {
              const snapshot = sessionActions.getMessageQueueSnapshot?.();
              if (!snapshot) {
                throw new Error('Message queue snapshot unavailable');
              }
              return snapshot;
            },
            promote: (queueItemId) => {
              if (!sessionActions.promoteQueuedMessage) {
                throw new Error('Queue promote is not available for this session.');
              }
              return sessionActions.promoteQueuedMessage(queueItemId);
            },
            cancel: (queueItemId) => {
              if (!sessionActions.cancelQueuedMessage) {
                throw new Error('Queue cancel is not available for this session.');
              }
              return sessionActions.cancelQueuedMessage(queueItemId);
            },
            edit: (queueItemId, content) => {
              if (!sessionActions.editQueuedMessage) {
                throw new Error('Queue edit is not available for this session.');
              }
              return sessionActions.editQueuedMessage(queueItemId, content);
            },
          }
        : undefined,
      mcp: sessionActions.listMcpServers
        ? {
            listServers: sessionActions.listMcpServers,
            listTools: sessionActions.listMcpTools,
            connect: sessionActions.connectMcpServer,
            disconnect: sessionActions.disconnectMcpServer,
            reconnect: sessionActions.reconnectMcpServer,
          }
        : undefined,
      capability:
        sessionActions.getCapabilityProviderSummaries &&
        sessionActions.getCapabilityDiagnostics &&
        sessionActions.listCapabilityTools
          ? {
              getProviderSummaries: sessionActions.getCapabilityProviderSummaries,
              getDiagnostics: sessionActions.getCapabilityDiagnostics,
              listTools: sessionActions.listCapabilityTools,
            }
          : undefined,
      status: {
        getSnapshot: () => {
          const status = useAgentStore.getState();
          return {
            sessionMode: status.sessionMode,
            executionMode: status.executionMode,
            agentStatus: status.status,
            tokensTotal: status.usage.total,
            chatModelIdentity: formatConfigChatModel(useConfigStore.getState().config),
            mediaModelSummary: formatMediaModelSummary(useConfigStore.getState().config),
            llmParameterSummary: formatLlmParameterSummary(useConfigStore.getState().config),
            activeSkillSummary: formatActiveSkillSummary(status.activeSkillLifecycleRecords),
            queueCount: status.messageQueue.snapshot?.pendingCount ?? 0,
          };
        },
      },
    },
  };
}

async function projectCommandResult(
  result: TuiCommandRouterResult,
  sessionActions: SlashCommandSessionActions,
): Promise<void> {
  if (result.output) {
    addSystemMessage(result.output);
  }
  if (result.error) {
    useConversationStore.getState().addError(new Error(result.error));
    return;
  }

  const activation = result.lifecycleActivation;
  if (activation) {
    const ok =
      (await sessionActions.activateSkill?.(activation.skillName, activation.args)) ?? false;
    if (!ok) {
      return;
    }
  }

  if (result.agentPrompt && sessionActions.submit) {
    await sessionActions.submit(result.agentPrompt, result.executionOverrides);
  }
}

/** Add a system-level informational message to the conversation */
function addSystemMessage(text: string): void {
  useConversationStore.getState().addSystemMessage(text);
}

function listEnabledSkills(skillService: SkillService | undefined): TuiSkillOption[] {
  return (
    skillService?.registry
      .listSkills()
      .filter((skill) => skill.enabled !== false)
      .map((skill) => ({
        name: skill.name,
        description: skill.description ?? undefined,
      })) ?? []
  );
}

/** Show a selection menu and return the selected ID (or null if cancelled) */
function showSelection(title: string, items: readonly SelectionMenuItem[]): Promise<string | null> {
  return new Promise((resolve) => {
    useUIStore.getState().showSelection({
      title,
      items: [...items],
      resolve: (selectedId) => {
        useUIStore.getState().dismissSelection();
        resolve(selectedId);
      },
    });
  });
}

/** Show a model picker and return the selected model. */
async function showModelPicker(
  title: string,
  models: readonly string[],
  currentModel: string,
): Promise<string | null> {
  const items: SelectionMenuItem[] = models.map((model) => ({
    id: model,
    label: model,
    active: model === currentModel,
  }));

  return showSelection(title, items);
}

function formatActiveSkillSummary(
  records: readonly ActiveSkillLifecycleRecordProjection[],
): string | undefined {
  const first = records[0];
  if (!first) {
    return undefined;
  }
  const suffix = records.length > 1 ? `+${records.length - 1}` : '';
  return `${first.skillName}[${first.slot}]${suffix}`;
}

function formatConfigChatModel(config: {
  provider: string;
  model: string;
  chatModel?: { providerId: string; modelId: string };
}): string {
  const providerId = config.chatModel?.providerId ?? config.provider;
  const modelId = config.chatModel?.modelId ?? config.model;
  return `${providerId}:${modelId}`;
}

function formatMediaModelSummary(config: {
  defaultMediaModels?: { image?: string; video?: string; audio?: string };
}): string | undefined {
  const media = config.defaultMediaModels ?? {};
  const entries = (['image', 'video', 'audio'] as const)
    .map((category) => (media[category] ? `${category}=${media[category]}` : undefined))
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(', ') : undefined;
}

function formatLlmParameterSummary(config: { llmConfig?: AgentLlmConfig }): string | undefined {
  const llmConfig = config.llmConfig;
  if (!llmConfig) return undefined;
  const entries = [
    llmConfig.reasoningPreset ? `reasoning=${llmConfig.reasoningPreset}` : undefined,
    llmConfig.verbosityPreset ? `verbosity=${llmConfig.verbosityPreset}` : undefined,
    llmConfig.creativityPreset ? `creativity=${llmConfig.creativityPreset}` : undefined,
    ...(llmConfig.advanced
      ? Object.entries(llmConfig.advanced).map(([key, value]) =>
          value !== undefined ? `${key}=${value}` : undefined,
        )
      : []),
  ].filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(', ') : undefined;
}
