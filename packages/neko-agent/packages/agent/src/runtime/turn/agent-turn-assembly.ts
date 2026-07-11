import type {
  AgentLlmConfig,
  AgentLegacyCreationTrace,
  AgentMediaModelSelections,
  MediaUnderstandingModelSelections,
  AgentModelSlots,
  AgentPhase,
  MediaModelCategory,
  Message,
  ModelRef,
} from '@neko-agent/types';
import type { Skill, SkillInjection, SkillLifecycleProjection } from '@neko/shared';
import type { AgentEvent } from '../../session/types';
import type { IRuntimeTaskManager } from '../../task';
import {
  createAgentTurnContext,
  type AgentTurnActiveEditorLike,
  type AgentTurnContext,
} from './agent-turn-context';
import type { AgentBase64ImageAttachment } from '../../input/attachment-projection';
import type {
  AgentAmbientCanvasNode,
  AgentLlmRuntimeOptions,
  AgentModelTokenMetadata,
  AgentMessageExecutionOverrides,
  AgentProviderCandidate,
  AgentStreamPersistenceSnapshot,
} from './message-runtime';
import type {
  AgentTurnHostMessage,
  AgentTurnAgentManager,
  AgentTurnRunner,
  AgentTurnTimelineContextInput,
  RunAgentTurnRuntimeInput,
} from './agent-turn-runtime';
import type { AgentPendingMessageSource } from '../runner/agent-runner-port';
import type { TimelineContextEditorLike, TimelineContextRuntime } from './timeline-context-runtime';
import type { WorkspaceFileIgnoreRules } from '../../input/workspace-ignore';
import {
  normalizeAgentRuntimePromptLocale,
  type AgentRuntimePromptLocale,
} from '../../input/attachment-projection';

export interface AgentTurnSettingsSource {
  readonly customSystemPrompt?: string | null;
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
}

export interface AgentTurnProviderHost<TProvider extends AgentProviderCandidate> {
  getProvider(providerId: string): TProvider | undefined;
}

export interface AgentTurnConversationHost<THistoryMessage> {
  getMessageCount(conversationId: string): number;
  getFullHistory(conversationId: string): readonly THistoryMessage[];
  addUserMessage?(conversationId: string, userMessage: Message): void;
  addAssistantMessage(conversationId: string, assistantMessage: Message): void;
}

export interface AgentTurnRuntimeServices<THistoryMessage> {
  readonly conversations: AgentTurnConversationHost<THistoryMessage>;
  readonly getBaseSystemPrompt: (conversationId: string) => string;
  readonly isPlanMode: (conversationId: string) => boolean;
  readonly getActiveSkillState?: (conversationId: string) => AgentTurnActiveSkillState | undefined;
  readonly getSkillLifecycleProjection?: (
    conversationId: string,
  ) => SkillLifecycleProjection | undefined;
  readonly taskManager?: IRuntimeTaskManager;
  readonly legacyTrace?: AgentLegacyCreationTrace;
}

export interface AgentTurnActiveSkillState {
  readonly skill: Skill;
  readonly injection: SkillInjection;
}

export interface AgentTurnContextHostOptions<TActiveEditor extends AgentTurnActiveEditorLike> {
  readonly getWorkspaceRoot?: () => string | undefined;
  readonly getAuthorizedReadRoots?: () => readonly string[];
  readonly getWorkspaceIgnoreRules?: () => WorkspaceFileIgnoreRules | undefined;
  readonly getActiveEditor?: () => TActiveEditor | undefined;
  readonly getAmbientCanvas?: (conversationId: string) => readonly AgentAmbientCanvasNode[];
  readonly timelineContextRuntime?: TimelineContextRuntime;
}

export interface AgentTurnContextHostAdapters<TActiveEditor extends AgentTurnActiveEditorLike> {
  readonly getWorkspaceRoot?: () => string | undefined;
  readonly getAuthorizedReadRoots?: () => readonly string[];
  readonly getWorkspaceIgnoreRules?: () => WorkspaceFileIgnoreRules | undefined;
  readonly getAmbientCanvas?: (conversationId: string) => readonly AgentAmbientCanvasNode[];
  readonly createContext: (input: {
    readonly conversationId: string;
    readonly message: string;
    readonly workspaceRoot?: string;
  }) => AgentTurnContext<TActiveEditor>;
  readonly buildTimelineContextPacket?: (
    input: AgentTurnTimelineContextInput<AgentTurnContext<TActiveEditor>>,
  ) => unknown | Promise<unknown>;
}

export interface AgentTurnHostAdapters<
  TPlatform,
  TActiveEditor extends AgentTurnActiveEditorLike,
  THistoryMessage,
  TRunner extends AgentTurnRunner<TPlatform, AgentTurnContext<TActiveEditor>>,
> extends AgentTurnContextHostOptions<TActiveEditor> {
  readonly agentManager?:
    | AgentTurnAgentManager<TPlatform, AgentTurnContext<TActiveEditor>, THistoryMessage, TRunner>
    | undefined;
  readonly processStream: (input: {
    readonly conversationId: string;
    readonly messageId: string;
    readonly events: AsyncIterable<AgentEvent>;
    readonly onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
  }) => Promise<AgentStreamPersistenceSnapshot>;
  readonly ensureSubAgentEventSubscription?: (input: {
    readonly conversationId: string;
    readonly agentRunner: TRunner;
  }) => void;
  readonly postMessage: (message: AgentTurnHostMessage) => void | Promise<void>;
  readonly onPhaseChange?: (event: {
    readonly conversationId: string;
    readonly phase: AgentPhase;
    readonly toolName?: string;
    readonly timestamp: number;
  }) => void;
  readonly onErrorMessage?: (conversationId: string, message: Message) => void;
  readonly generateMessageId: () => string;
  readonly now?: () => number;
}

export interface AgentTurnAssemblyInput<
  TPlatform,
  TActiveEditor extends AgentTurnActiveEditorLike,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, AgentTurnContext<TActiveEditor>>,
> {
  readonly conversationId: string;
  readonly message: string;
  readonly pendingMessageSource?: AgentPendingMessageSource;
  readonly platform?: TPlatform | null;
  readonly chatModel?: ModelRef<'llm'>;
  readonly agentModels?: AgentModelSlots;
  readonly llmConfig?: AgentLlmConfig;
  readonly llmRuntimeOptions?: AgentLlmRuntimeOptions;
  readonly modelTokenMetadata?: AgentModelTokenMetadata;
  readonly modelCapabilities?: readonly string[];
  readonly locale?: AgentRuntimePromptLocale | string;
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly understandingModels?: MediaUnderstandingModelSelections;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly settings: AgentTurnSettingsSource;
  readonly providers: AgentTurnProviderHost<TProvider>;
  readonly runtime: AgentTurnRuntimeServices<THistoryMessage>;
  readonly host: AgentTurnHostAdapters<TPlatform, TActiveEditor, THistoryMessage, TRunner>;
}

export function createAgentTurnHostContextAdapters<TActiveEditor extends AgentTurnActiveEditorLike>(
  options: AgentTurnContextHostOptions<TActiveEditor>,
): AgentTurnContextHostAdapters<TActiveEditor> {
  return {
    ...(options.getWorkspaceRoot ? { getWorkspaceRoot: options.getWorkspaceRoot } : {}),
    ...(options.getAuthorizedReadRoots
      ? { getAuthorizedReadRoots: options.getAuthorizedReadRoots }
      : {}),
    ...(options.getWorkspaceIgnoreRules
      ? { getWorkspaceIgnoreRules: options.getWorkspaceIgnoreRules }
      : {}),
    ...(options.getAmbientCanvas ? { getAmbientCanvas: options.getAmbientCanvas } : {}),
    createContext: ({ workspaceRoot }) =>
      createAgentTurnContext({
        activeEditor: options.getActiveEditor?.(),
        workspaceRoot,
      }),
    buildTimelineContextPacket: ({ context, message, workspaceRoot }) => {
      const activeEditor = context.activeEditor;
      if (!options.timelineContextRuntime || !isTimelineContextEditorLike(activeEditor)) {
        return null;
      }
      return options.timelineContextRuntime.build({
        activeEditor,
        message,
        workspaceRoot,
      });
    },
  };
}

export function buildAgentTurnRuntimeInput<
  TPlatform,
  TActiveEditor extends AgentTurnActiveEditorLike,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, AgentTurnContext<TActiveEditor>>,
>(
  input: AgentTurnAssemblyInput<TPlatform, TActiveEditor, THistoryMessage, TProvider, TRunner>,
): RunAgentTurnRuntimeInput<
  TPlatform,
  AgentTurnContext<TActiveEditor>,
  THistoryMessage,
  TProvider,
  TRunner
> {
  const contextAdapters = createAgentTurnHostContextAdapters(input.host);
  const activeSkill = input.runtime.getActiveSkillState?.(input.conversationId);
  const skillLifecycleProjection = input.runtime.getSkillLifecycleProjection?.(
    input.conversationId,
  );

  return {
    conversationId: input.conversationId,
    message: input.message,
    ...(input.pendingMessageSource ? { pendingMessageSource: input.pendingMessageSource } : {}),
    platform: input.platform,
    chatModel: input.chatModel,
    agentModels: input.agentModels,
    llmConfig: input.llmConfig,
    llmRuntimeOptions: input.llmRuntimeOptions,
    modelTokenMetadata: input.modelTokenMetadata,
    modelCapabilities: input.modelCapabilities,
    locale: normalizeAgentRuntimePromptLocale(input.locale),
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
    understandingModels: input.understandingModels,
    imageAttachments: input.imageAttachments,
    executionOverrides: input.executionOverrides,
    activeSkill,
    ...(skillLifecycleProjection
      ? { skillLifecycle: { projection: skillLifecycleProjection } }
      : {}),
    settings: {
      customSystemPrompt: input.settings.customSystemPrompt,
      executionMode: input.settings.executionMode,
      autoExecuteTools: input.settings.autoExecuteTools,
      temperature: input.settings.temperature,
      topP: input.settings.topP,
      maxTokens: input.settings.maxTokens,
      thinkingBudget: input.settings.thinkingBudget,
    },
    providerSource: {
      getProvider: (providerId) => input.providers.getProvider(providerId),
    },
    agentManager: input.host.agentManager,
    conversations: {
      getConversationMessageCount: (conversationId) =>
        input.runtime.conversations.getMessageCount(conversationId),
      getFullHistory: (conversationId) =>
        input.runtime.conversations.getFullHistory(conversationId),
      ...(input.runtime.conversations.addUserMessage
        ? {
            addUserMessage: (conversationId, userMessage) => {
              input.runtime.conversations.addUserMessage?.(conversationId, userMessage);
            },
          }
        : {}),
      addAssistantMessage: (conversationId, assistantMessage) => {
        input.runtime.conversations.addAssistantMessage(conversationId, assistantMessage);
      },
    },
    getBaseSystemPrompt: input.runtime.getBaseSystemPrompt,
    isPlanMode: input.runtime.isPlanMode,
    ...contextAdapters,
    processStream: input.host.processStream,
    ensureSubAgentEventSubscription: input.host.ensureSubAgentEventSubscription,
    postMessage: input.host.postMessage,
    onPhaseChange: input.host.onPhaseChange,
    onErrorMessage: (errorMessage) => {
      input.host.onErrorMessage?.(input.conversationId, errorMessage);
    },
    generateMessageId: input.host.generateMessageId,
    now: input.host.now,
    ...(input.runtime.taskManager ? { taskManager: input.runtime.taskManager } : {}),
    ...(input.runtime.legacyTrace ? { legacyTrace: input.runtime.legacyTrace } : {}),
  };
}

function isTimelineContextEditorLike(value: unknown): value is TimelineContextEditorLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    readonly capabilities?: { readonly hasTimeline?: unknown };
    readonly getSelection?: unknown;
    readonly getState?: unknown;
    readonly getContent?: unknown;
  };

  return (
    typeof candidate.capabilities?.hasTimeline === 'boolean' &&
    typeof candidate.getSelection === 'function' &&
    typeof candidate.getState === 'function' &&
    typeof candidate.getContent === 'function'
  );
}
