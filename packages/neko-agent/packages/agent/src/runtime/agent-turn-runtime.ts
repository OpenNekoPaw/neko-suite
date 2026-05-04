import type {
  AgentPhaseMessage,
  ErrorMessage,
  AgentMediaModelSelections,
  AgentPhase,
  MediaModelCategory,
  Message,
  ModelRef,
  ToolConfirmationMessage,
  AgentWorkflowIdentity,
} from '@neko-agent/types';
import {
  buildAgentPhaseMessage,
  buildErrorMessage,
  buildToolConfirmationMessage,
} from '@neko-agent/types';
import type { Skill, SkillInjection } from '@neko/shared';
import type { AgentEvent } from '../session/types';
import type { IRuntimeTaskManager } from '../task';
import type { IOperationToolAdapterRegistry } from '@neko/shared';
import {
  buildAgentAssistantMessageFromStream,
  buildAgentHistoryHydrationPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  getAgentTurnFallbackMessage,
  selectAgentTurnProvider,
  type AgentAmbientCanvasNode,
  type AgentMessageExecutionOverrides,
  type AgentMessageTurnFallbackReason,
  type AgentProviderCandidate,
  type AgentStreamPersistenceSnapshot,
  type ProviderExpressionTargetConfig,
} from './message-runtime';
import type { AgentBase64ImageAttachment } from './attachment-projection';
import {
  buildTurnMultimodalContextPacket,
  createCanvasSelectionContextPacket,
} from './multimodal-context-packet';

export interface AgentTurnDisposable {
  dispose(): void;
}

export interface AgentTurnConfirmationRequest {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly action: string;
  readonly description: string;
  readonly details: Record<string, unknown>;
}

export interface AgentTurnRunnerConfigureInput<TPlatform> {
  readonly platform: TPlatform;
  readonly systemPrompt: string;
  readonly maxIterations: number;
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly modelId?: string;
  readonly providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly thinkingBudget?: number;
  readonly workspaceRoot?: string;
  readonly conversationId: string;
  readonly taskManager?: IRuntimeTaskManager;
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
}

export interface AgentTurnRunner<TPlatform, TContext extends object> {
  getHistory(): readonly unknown[];
  configure(config: AgentTurnRunnerConfigureInput<TPlatform>): Promise<void>;
  execute(input: string, context: TContext): AsyncIterable<AgentEvent>;
  applySkillInjection?(injection: SkillInjection, skill?: Skill): void;
  onDidRequestConfirmation(
    listener: (request: AgentTurnConfirmationRequest) => void,
  ): AgentTurnDisposable;
}

export interface AgentTurnAgentManager<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TRunner extends AgentTurnRunner<TPlatform, TContext> = AgentTurnRunner<TPlatform, TContext>,
> {
  getOrCreate(conversationId: string): TRunner;
  loadHistoryWithContext(conversationId: string, messages: readonly THistoryMessage[]): void;
}

export interface AgentTurnConversationStore<THistoryMessage> {
  getConversationMessageCount(conversationId: string): number;
  getFullHistory(conversationId: string): readonly THistoryMessage[];
  addAssistantMessage(conversationId: string, message: Message): void;
}

export interface AgentTurnProviderSource<TProvider extends AgentProviderCandidate> {
  readonly requestedProviderId?: string | null;
  readonly selectedProviderId?: string | null;
  getProvider(providerId: string): TProvider | undefined;
  getDefaultProvider(): TProvider | undefined;
}

export interface AgentTurnRuntimeSettings {
  readonly customSystemPrompt?: string | null;
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
}

export interface AgentTurnActiveSkillState {
  readonly skill: Skill;
  readonly injection: SkillInjection;
}

export interface AgentTurnContextFactoryInput {
  readonly conversationId: string;
  readonly message: string;
  readonly workspaceRoot?: string;
}

export interface AgentTurnTimelineContextInput<TContext extends object> {
  readonly context: TContext;
  readonly message: string;
  readonly workspaceRoot?: string;
}

export interface AgentTurnStreamProcessorInput {
  readonly conversationId: string;
  readonly events: AsyncIterable<AgentEvent>;
  readonly onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
}

export type AgentTurnExecutionResult =
  | {
      readonly status: 'completed';
      readonly assistantMessage?: Message;
    }
  | {
      readonly status: 'fallback';
      readonly reason: AgentTurnFallbackReason;
    };

export type AgentTurnFallbackReason = AgentMessageTurnFallbackReason;

export { AGENT_TURN_FALLBACK_MESSAGE, getAgentTurnFallbackMessage } from './message-runtime';

export interface ExecuteAgentTurnInput<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext> = AgentTurnRunner<TPlatform, TContext>,
> {
  readonly conversationId: string;
  readonly message: string;
  readonly platform?: TPlatform | null;
  readonly chatModel?: ModelRef<'llm'>;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly activeSkill?: AgentTurnActiveSkillState | null;
  readonly settings: AgentTurnRuntimeSettings;
  readonly providerSource: AgentTurnProviderSource<TProvider>;
  readonly agentManager: AgentTurnAgentManager<TPlatform, TContext, THistoryMessage, TRunner>;
  readonly conversations: AgentTurnConversationStore<THistoryMessage>;
  readonly getBaseSystemPrompt: (conversationId: string) => string;
  readonly isPlanMode: (conversationId: string) => boolean;
  readonly getWorkspaceRoot?: () => string | undefined;
  readonly getAmbientCanvas?: (conversationId: string) => readonly AgentAmbientCanvasNode[];
  readonly createContext: (input: AgentTurnContextFactoryInput) => TContext | Promise<TContext>;
  readonly buildTimelineContextPacket?: (
    input: AgentTurnTimelineContextInput<TContext>,
  ) => unknown | Promise<unknown>;
  readonly applyContextPatch?: (
    context: TContext,
    patch: ReturnType<typeof buildAgentTurnContextPatch>,
  ) => void;
  readonly processStream: (
    input: AgentTurnStreamProcessorInput,
  ) => Promise<AgentStreamPersistenceSnapshot>;
  readonly ensureSubAgentEventSubscription?: (input: {
    readonly conversationId: string;
    readonly agentRunner: TRunner;
  }) => void;
  readonly onToolConfirmation?: (event: {
    readonly conversationId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly action: string;
    readonly description: string;
    readonly details: Record<string, unknown>;
  }) => void;
  readonly onPhaseChange?: (event: {
    readonly conversationId: string;
    readonly phase: AgentPhase;
    readonly toolName?: string;
    readonly timestamp: number;
  }) => void;
  readonly generateMessageId: () => string;
  readonly now?: () => number;
  readonly taskManager?: IRuntimeTaskManager;
  readonly workflow?: AgentWorkflowIdentity;
}

export type AgentTurnForWebviewRuntimeMessage =
  | AgentPhaseMessage
  | ErrorMessage
  | ToolConfirmationMessage;

export interface RunAgentTurnForWebviewRuntimeInput<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext> = AgentTurnRunner<TPlatform, TContext>,
> extends Omit<
  ExecuteAgentTurnInput<TPlatform, TContext, THistoryMessage, TProvider, TRunner>,
  'agentManager' | 'onToolConfirmation' | 'onPhaseChange'
> {
  readonly agentManager?:
    | AgentTurnAgentManager<TPlatform, TContext, THistoryMessage, TRunner>
    | undefined;
  readonly postMessage: (message: AgentTurnForWebviewRuntimeMessage) => void | Promise<void>;
  readonly onPhaseChange?: ExecuteAgentTurnInput<
    TPlatform,
    TContext,
    THistoryMessage,
    TProvider,
    TRunner
  >['onPhaseChange'];
  readonly onExecutionError?: (error: unknown) => void;
}

export type RunAgentTurnForWebviewRuntimeResult =
  | AgentTurnExecutionResult
  | {
      readonly status: 'failed';
      readonly error: unknown;
    };

export async function runAgentTurnForWebviewRuntime<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext> = AgentTurnRunner<TPlatform, TContext>,
>(
  input: RunAgentTurnForWebviewRuntimeInput<
    TPlatform,
    TContext,
    THistoryMessage,
    TProvider,
    TRunner
  >,
): Promise<RunAgentTurnForWebviewRuntimeResult> {
  const now = input.now ?? Date.now;
  const postMessage = (message: AgentTurnForWebviewRuntimeMessage): void => {
    void input.postMessage(message);
  };
  const postPhase = (event: {
    readonly conversationId: string;
    readonly phase: AgentPhase;
    readonly toolName?: string;
    readonly timestamp: number;
  }): void => {
    input.onPhaseChange?.(event);
    postMessage(buildAgentPhaseMessage(event));
  };

  if (!input.agentManager) {
    postMessage(
      buildErrorMessage({
        conversationId: input.conversationId,
        message: getAgentTurnFallbackMessage('no-provider-configured'),
      }),
    );
    return { status: 'fallback', reason: 'no-provider-configured' };
  }

  try {
    const result = await executeAgentTurn({
      ...input,
      agentManager: input.agentManager,
      onToolConfirmation: (request) => {
        postMessage(buildToolConfirmationMessage(request));
      },
      onPhaseChange: postPhase,
      now,
    });

    if (result.status === 'fallback') {
      postMessage(
        buildErrorMessage({
          conversationId: input.conversationId,
          message: getAgentTurnFallbackMessage(result.reason),
        }),
      );
    }

    return result;
  } catch (error) {
    input.onExecutionError?.(error);
    postPhase({
      conversationId: input.conversationId,
      phase: 'idle',
      timestamp: now(),
    });
    postMessage(
      buildErrorMessage({
        conversationId: input.conversationId,
        message: error instanceof Error ? error.message : 'Failed to generate response',
      }),
    );
    return { status: 'failed', error };
  }
}

export async function executeAgentTurn<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext> = AgentTurnRunner<TPlatform, TContext>,
>(
  input: ExecuteAgentTurnInput<TPlatform, TContext, THistoryMessage, TProvider, TRunner>,
): Promise<AgentTurnExecutionResult> {
  const providerSelection = selectAgentTurnProvider({
    requestedProviderId: input.providerSource.requestedProviderId ?? undefined,
    selectedProviderId: input.providerSource.selectedProviderId ?? undefined,
    getProvider: (providerId) => input.providerSource.getProvider(providerId),
    getDefaultProvider: () => input.providerSource.getDefaultProvider(),
  });
  if (!providerSelection.ok) {
    return { status: 'fallback', reason: 'no-provider-configured' };
  }

  const platform = input.platform;
  if (!platform) {
    return { status: 'fallback', reason: 'missing-platform' };
  }

  const now = input.now ?? Date.now;
  const workspaceRoot = input.getWorkspaceRoot?.();
  const ambientCanvas = input.getAmbientCanvas?.(input.conversationId) ?? [];
  const agentRunner = input.agentManager.getOrCreate(input.conversationId);

  hydrateAgentHistoryIfNeeded({
    conversationId: input.conversationId,
    agentRunner,
    agentManager: input.agentManager,
    conversations: input.conversations,
  });

  const turnConfig = buildAgentTurnConfigurationPlan({
    conversationId: input.conversationId,
    baseSystemPrompt:
      input.settings.customSystemPrompt || input.getBaseSystemPrompt(input.conversationId),
    ambientCanvas,
    isPlanMode: input.isPlanMode(input.conversationId),
    executionMode: input.settings.executionMode,
    chatModel: input.chatModel,
    executionOverrides: input.executionOverrides,
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
    maxIterations: 200,
    autoExecuteTools: input.settings.autoExecuteTools,
    temperature: input.settings.temperature,
    maxTokens: input.settings.maxTokens,
    thinkingBudget: input.settings.thinkingBudget,
    workspaceRoot,
  });

  await agentRunner.configure({
    platform,
    systemPrompt: turnConfig.systemPrompt,
    maxIterations: turnConfig.maxIterations,
    autoExecuteTools: turnConfig.autoExecuteTools,
    temperature: turnConfig.temperature,
    maxTokens: turnConfig.maxTokens,
    modelId: turnConfig.modelId,
    providerExpressionTargets: turnConfig.providerExpressionTargets,
    executionMode: turnConfig.executionMode,
    thinkingBudget: turnConfig.thinkingBudget,
    workspaceRoot: turnConfig.workspaceRoot,
    conversationId: turnConfig.conversationId,
    ...(input.taskManager ? { taskManager: input.taskManager } : {}),
  });

  if (input.activeSkill) {
    agentRunner.applySkillInjection?.(input.activeSkill.injection, input.activeSkill.skill);
  }

  const context = await input.createContext({
    conversationId: input.conversationId,
    message: input.message,
    workspaceRoot,
  });
  const timelineContextPacket = await input.buildTimelineContextPacket?.({
    context,
    message: input.message,
    workspaceRoot,
  });
  const canvasContextPacket =
    ambientCanvas.length > 0
      ? createCanvasSelectionContextPacket(ambientCanvas, {
          userAnnotation: input.message,
        })
      : null;
  const multimodalContextPacket = buildTurnMultimodalContextPacket({
    conversationId: input.conversationId,
    message: input.message,
    imageAttachments: input.imageAttachments,
    timelineContextPacket: isMultimodalContextPacket(timelineContextPacket)
      ? timelineContextPacket
      : null,
    canvasContextPacket,
    ...(input.workflow ? { workflow: input.workflow } : {}),
  });

  const contextPatch = buildAgentTurnContextPatch({
    imageAttachments: input.imageAttachments,
    timelineContextPacket,
    canvasNodes: ambientCanvas,
    canvasContextPacket,
    multimodalContextPacket,
    executionMetadata: turnConfig.executionMetadata,
  });
  applyAgentTurnContextPatch(context, contextPatch, input.applyContextPatch);

  let confirmationDisposable: AgentTurnDisposable | undefined;
  try {
    confirmationDisposable = agentRunner.onDidRequestConfirmation((request) => {
      input.onToolConfirmation?.({
        conversationId: input.conversationId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        action: request.action,
        description: request.description,
        details: request.details,
      });
    });

    input.ensureSubAgentEventSubscription?.({
      conversationId: input.conversationId,
      agentRunner,
    });

    const stream = await input.processStream({
      conversationId: input.conversationId,
      events: agentRunner.execute(input.message, context),
      onPhaseChange: (phase, toolName) => {
        input.onPhaseChange?.({
          conversationId: input.conversationId,
          phase,
          toolName,
          timestamp: now(),
        });
      },
    });

    const assistantMessage = buildAgentAssistantMessageFromStream({
      id: input.generateMessageId(),
      timestamp: now(),
      stream,
    });
    if (assistantMessage) {
      input.conversations.addAssistantMessage(input.conversationId, assistantMessage);
      return { status: 'completed', assistantMessage };
    }

    return { status: 'completed' };
  } finally {
    confirmationDisposable?.dispose();
  }
}

function isMultimodalContextPacket(
  value: unknown,
): value is import('@neko/shared').MultimodalContextPacket {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { readonly perceptionInputs?: unknown }).perceptionInputs) &&
    Array.isArray((value as { readonly selection?: unknown }).selection),
  );
}

function hydrateAgentHistoryIfNeeded<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TRunner extends AgentTurnRunner<TPlatform, TContext>,
>(input: {
  readonly conversationId: string;
  readonly agentRunner: TRunner;
  readonly agentManager: AgentTurnAgentManager<TPlatform, TContext, THistoryMessage, TRunner>;
  readonly conversations: AgentTurnConversationStore<THistoryMessage>;
}): void {
  const hydrationPlan = buildAgentHistoryHydrationPlan({
    agentHistoryLength: input.agentRunner.getHistory().length,
    conversationMessageCount: input.conversations.getConversationMessageCount(input.conversationId),
    fullHistory: input.conversations.getFullHistory(input.conversationId),
  });

  if (hydrationPlan.kind === 'load-history') {
    input.agentManager.loadHistoryWithContext(input.conversationId, hydrationPlan.historyToLoad);
  }
}

function applyAgentTurnContextPatch<TContext extends object>(
  context: TContext,
  patch: ReturnType<typeof buildAgentTurnContextPatch>,
  applyContextPatch:
    | ((context: TContext, patch: ReturnType<typeof buildAgentTurnContextPatch>) => void)
    | undefined,
): void {
  if (applyContextPatch) {
    applyContextPatch(context, patch);
    return;
  }

  Object.assign(context, patch);
}
