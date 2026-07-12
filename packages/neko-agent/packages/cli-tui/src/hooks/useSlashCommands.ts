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
import { AgentMessageQueueOperationError } from '@neko/agent/runtime';
import type { ChatModelOption } from '@neko/shared';
import { toQueueOperationDiagnostic } from '../core/message-queue-semantics';
import { presentQueueCommand } from '../presentation/work-queue-presentation';
import { useAgentStore } from '../stores/agent-store';
import { useConfigStore } from '../stores/config-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import { presentCommandShellDiagnostic } from '../presentation/command-shell-presentation';

export { isSlashCommand, isSkillInvocation };

function presentQueueFailure(
  error: unknown,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const projection = presentQueueCommand(toQueueOperationDiagnostic(error), presentation);
  if (projection.kind !== 'error') {
    throw new Error('Queue operation failure must project to a terminal diagnostic.');
  }
  return projection.error;
}

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
  discardQueuedContinuation?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['discardQueuedContinuation']
  >;
  editQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['editQueuedMessage']
  >;
  listTasks?: import('./useAgentSession').AgentSessionHandle['listTasks'];
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
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  userConfigPath: string;
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
      if (!isAllowedRunningCommand(input) && isAgentRunning()) {
        const error = isSkillInvocation(input)
          ? new AgentMessageQueueOperationError(
              'not-queueable',
              'Skill invocations cannot be queued while an Agent turn is running.',
            )
          : new AgentMessageQueueOperationError(
              'not-queueable',
              'Commands cannot be queued while an Agent turn is running.',
            );
        const message = presentQueueFailure(error, sessionActions.presentation);
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
          throw new Error('TUI command router returned an unhandled slash command.');
        }

        await projectCommandResult(result, sessionActions);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const projection = presentCommandShellDiagnostic(
          { kind: 'command-failed', detail },
          sessionActions.presentation,
        );
        if (projection.kind !== 'error') {
          throw new Error('Command failure must project to a terminal diagnostic.');
        }
        useConversationStore.getState().addError(new Error(projection.error));
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
  if (
    commandName === 'queue' ||
    commandName === 'task' ||
    commandName === 'tasks' ||
    commandName === 'status' ||
    commandName === 's'
  ) {
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
      presentation: sessionActions.presentation,
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
    const detail = error instanceof Error ? error.message : String(error);
    const projection = presentCommandShellDiagnostic(
      { kind: 'skill-invocation-failed', detail },
      sessionActions.presentation,
    );
    if (projection.kind !== 'error') {
      throw new Error('Skill invocation failure must project to a terminal diagnostic.');
    }
    useConversationStore.getState().addError(new Error(projection.error));
  }
}

function createInkRouterContext(
  sessionActions: SlashCommandSessionActions,
): TuiCommandRouterContext {
  const config = useConfigStore.getState().config;
  return {
    presentation: sessionActions.presentation,
    slash: {
      locale: sessionActions.presentation.uiLocale,
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
        },
      },
      mode: {
        getSessionMode: () => useAgentStore.getState().sessionMode,
        setSessionMode: (mode) => {
          useAgentStore.getState().setSessionMode(mode);
          sessionActions.syncRuntimeState?.();
        },
        setExecutionMode: (mode) => {
          sessionActions.updateMode?.(mode);
        },
      },
      model: {
        listChatModelOptions: () => listChatModelOptions(useConfigStore.getState().config.workDir),
        listChatModels: () => {
          const currentConfig = useConfigStore.getState().config;
          return getProviderModels(currentConfig.provider, currentConfig.workDir);
        },
        ...(sessionActions.updateModel
          ? {
              selectChatModel: (model: string | TuiModelIdentity): TuiModelIdentity => {
                sessionActions.updateModel?.(model);
                const currentConfig = useConfigStore.getState().config;
                const selected = currentConfig.chatModel;
                if (selected === undefined) {
                  throw new Error('Chat model mutation did not produce canonical config state.');
                }
                return resolveConfiguredModelIdentity(
                  `${selected.providerId}:${selected.modelId}`,
                  listChatModelOptions(currentConfig.workDir),
                  selected.providerId,
                  typeof model === 'string' ? undefined : model,
                );
              },
            }
          : {}),
        selectMenuItem: (input) => showSelection(input.title, [...input.items]),
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
          const updatedConfig = useConfigStore.getState().config;
          const stored = updatedConfig.defaultMediaModels?.[category];
          if (stored === undefined) {
            throw new Error('Media model mutation did not produce canonical config state.');
          }
          return stored === 'none'
            ? 'none'
            : resolveConfiguredModelIdentity(
                stored,
                listChatModelOptions(updatedConfig.workDir),
                model === 'none' ? updatedConfig.provider : model.providerId,
                model === 'none' ? undefined : model,
              );
        },
        resetMediaModels: () => {
          useConfigStore.getState().setConfig({ defaultMediaModels: {} });
          sessionActions.syncRuntimeState?.();
          return { ...(useConfigStore.getState().config.defaultMediaModels ?? {}) };
        },
      },
      perception: {
        listPerceptionModelOptions: () =>
          listChatModelOptions(useConfigStore.getState().config.workDir).filter(
            (option) => option.category === 'llm',
          ),
        getCurrentPerceptionModels: () => useConfigStore.getState().config.perceptionModels ?? {},
        setPerceptionModel: (category, model) => {
          const config = useConfigStore.getState().config;
          const current = config.perceptionModels ?? {};
          const next = { ...current };
          if (model === 'auto') {
            delete next[category];
          } else {
            next[category] = model.optionId ?? `${model.providerId}:${model.modelId}`;
          }
          useConfigStore.getState().setConfig({ perceptionModels: next });
          sessionActions.syncRuntimeState?.();
          const updatedConfig = useConfigStore.getState().config;
          const stored = updatedConfig.perceptionModels?.[category];
          if (stored === undefined) return 'auto';
          return resolveConfiguredModelIdentity(
            stored,
            listChatModelOptions(updatedConfig.workDir),
            model === 'auto' ? updatedConfig.provider : model.providerId,
            model === 'auto' ? undefined : model,
          );
        },
        resetPerceptionModels: () => {
          useConfigStore.getState().setConfig({ perceptionModels: {} });
          sessionActions.syncRuntimeState?.();
          return { ...(useConfigStore.getState().config.perceptionModels ?? {}) };
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
        compact: sessionActions.compactContext,
      },
      queue: sessionActions.getMessageQueueSnapshot
        ? {
            getSnapshot: sessionActions.getMessageQueueSnapshot,
            ...(sessionActions.promoteQueuedMessage
              ? { promote: sessionActions.promoteQueuedMessage }
              : {}),
            ...(sessionActions.cancelQueuedMessage
              ? { cancel: sessionActions.cancelQueuedMessage }
              : {}),
            ...(sessionActions.discardQueuedContinuation
              ? { discardContinuation: sessionActions.discardQueuedContinuation }
              : {}),
            ...(sessionActions.editQueuedMessage ? { edit: sessionActions.editQueuedMessage } : {}),
          }
        : undefined,
      task: sessionActions.listTasks
        ? {
            list: sessionActions.listTasks,
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
          const agentState = useAgentStore.getState();
          return {
            config,
            execution: {
              sessionMode: agentState.sessionMode,
              executionMode: agentState.executionMode,
              status: agentState.status,
            },
            usage: agentState.usage,
            ...(agentState.contextTokens.count === null
              ? {}
              : { contextTokenCount: agentState.contextTokens.count }),
            activeSkills: agentState.activeSkillLifecycleRecords,
            ...(agentState.messageQueue.snapshot === null
              ? {}
              : { messageQueue: agentState.messageQueue.snapshot }),
            ...(agentState.tasks.running[0] === undefined
              ? {}
              : { runningTask: agentState.tasks.running[0] }),
            userConfigPath: sessionActions.userConfigPath,
          };
        },
      },
    },
  };
}

function resolveConfiguredModelIdentity(
  storedIdentity: string,
  options: readonly ChatModelOption[],
  fallbackProviderId: string,
  requested?: TuiModelIdentity,
): TuiModelIdentity {
  const option = options.find(
    (candidate) =>
      candidate.id === storedIdentity ||
      candidate.modelId === storedIdentity ||
      `${candidate.providerId}:${candidate.modelId}` === storedIdentity ||
      `${candidate.providerId}/${candidate.modelId}` === storedIdentity,
  );
  if (option !== undefined) {
    return {
      providerId: option.providerId,
      modelId: option.modelId,
      ...(option.providerExpressionProfileId
        ? { providerExpressionProfileId: option.providerExpressionProfileId }
        : {}),
      optionId: option.id,
      label: option.label,
      ...(option.category ? { category: option.category } : {}),
      ...(option.capabilities ? { capabilities: option.capabilities } : {}),
    };
  }

  const separator = storedIdentity.includes('/') ? '/' : storedIdentity.includes(':') ? ':' : null;
  const [providerId, modelId] =
    separator === null ? [fallbackProviderId, storedIdentity] : storedIdentity.split(separator, 2);
  if (!providerId || !modelId) {
    throw new Error(`Invalid canonical model identity returned by config: ${storedIdentity}`);
  }
  if (
    requested !== undefined &&
    requested.providerId === providerId &&
    requested.modelId === modelId
  ) {
    return requested;
  }
  return {
    providerId,
    modelId,
    optionId: storedIdentity,
    label: `${providerId} / ${modelId}`,
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
