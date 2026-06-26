import type {
  AgentLlmConfig,
  AgentPhaseMessage,
  ErrorMessage,
  MessageQueuedMessage,
  AgentModelSlots,
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
import {
  AGENT_SESSION_BUSY_MESSAGE,
  AGENT_SESSION_CONFIG_LOCKED_MESSAGE,
} from './agent-session-runner';
import type { IRuntimeTaskManager } from '../task';
import type { IOperationToolAdapterRegistry } from '@neko/shared';
import {
  buildAgentAssistantMessageFromStream,
  buildAgentErrorAssistantMessage,
  buildAgentHistoryHydrationPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  getAgentTurnPreconditionMessage,
  selectAgentTurnProvider,
  type AgentAmbientCanvasNode,
  type AgentTurnConfigurationPlan,
  type AgentLlmRuntimeOptions,
  type AgentMessageExecutionOverrides,
  type AgentMessageTurnPreconditionReason,
  type AgentProviderCandidate,
  type AgentStreamPersistenceSnapshot,
  type ProviderExpressionTargetConfig,
} from './message-runtime';
import type { AgentBase64ImageAttachment } from './attachment-projection';
import {
  buildTurnMultimodalContextPacket,
  createCanvasSelectionContextPacket,
} from './multimodal-context-packet';
import { getLogger } from '../utils/logger';
import type { WorkspaceFileIgnoreRules } from '../input/workspace-ignore';

function getAgentTurnRuntimeLogger() {
  return getLogger('AgentTurnRuntime');
}

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
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelCapabilities?: readonly string[];
  readonly providerExpressionTargets?: readonly ProviderExpressionTargetConfig[];
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly thinkingBudget?: number;
  readonly providerOptions?: Record<string, unknown>;
  readonly workspaceRoot?: string;
  readonly authorizedReadRoots?: readonly string[];
  readonly workspaceIgnoreRules?: WorkspaceFileIgnoreRules;
  readonly conversationId: string;
  readonly taskManager?: IRuntimeTaskManager;
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
}

export interface AgentTurnRunner<TPlatform, TContext extends object> {
  getHistory(): readonly unknown[];
  getConfig(): unknown;
  configure(config: AgentTurnRunnerConfigureInput<TPlatform>): Promise<void>;
  execute(input: string, context: TContext): AsyncIterable<AgentEvent>;
  isRunning(): boolean;
  appendMessage(input: string): boolean;
  getPendingMessagesCount(): number;
  drainPendingMessages(): string[];
  applySkillInjection?(injection: SkillInjection, skill?: Skill): void;
  getActiveSkill?(): Skill | undefined;
  clearActiveSkill?(): void;
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
  getProvider(providerId: string): TProvider | undefined;
}

export interface AgentTurnRuntimeSettings {
  readonly customSystemPrompt?: string | null;
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
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
  readonly messageId: string;
  readonly events: AsyncIterable<AgentEvent>;
  readonly onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
}

export type AgentTurnExecutionResult =
  | {
      readonly status: 'completed';
      readonly assistantMessage?: Message;
    }
  | {
      readonly status: 'precondition-unmet';
      readonly reason: AgentTurnPreconditionReason;
    }
  | {
      readonly status: 'queued';
      readonly pendingCount: number;
    };

export type AgentTurnPreconditionReason = AgentMessageTurnPreconditionReason;

export {
  AGENT_TURN_PRECONDITION_MESSAGE,
  getAgentTurnPreconditionMessage,
} from './message-runtime';

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
  readonly agentModels?: AgentModelSlots;
  readonly llmConfig?: AgentLlmConfig;
  readonly llmRuntimeOptions?: AgentLlmRuntimeOptions;
  readonly modelCapabilities?: readonly string[];
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
  readonly getAuthorizedReadRoots?: () => readonly string[];
  readonly getWorkspaceIgnoreRules?: () => WorkspaceFileIgnoreRules | undefined;
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
  readonly onMessageQueued?: (event: {
    readonly conversationId: string;
    readonly content?: string;
    readonly pendingCount: number;
  }) => void;
  readonly generateMessageId: () => string;
  readonly now?: () => number;
  readonly taskManager?: IRuntimeTaskManager;
  readonly workflow?: AgentWorkflowIdentity;
}

export type AgentTurnHostMessage =
  | AgentPhaseMessage
  | ErrorMessage
  | MessageQueuedMessage
  | ToolConfirmationMessage;

export interface RunAgentTurnRuntimeInput<
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
  readonly postMessage: (message: AgentTurnHostMessage) => void | Promise<void>;
  readonly onPhaseChange?: ExecuteAgentTurnInput<
    TPlatform,
    TContext,
    THistoryMessage,
    TProvider,
    TRunner
  >['onPhaseChange'];
  readonly onErrorMessage?: (message: Message) => void;
  readonly onExecutionError?: (error: unknown) => void;
}

export type RunAgentTurnRuntimeResult =
  | AgentTurnExecutionResult
  | {
      readonly status: 'failed';
      readonly error: unknown;
    };

const turnManagedSkillNames = new WeakMap<object, string>();

const RUNNING_TURN_CONFIG_KEYS = [
  'platform',
  'systemPrompt',
  'maxIterations',
  'autoExecuteTools',
  'temperature',
  'topP',
  'maxTokens',
  'providerId',
  'modelId',
  'modelCapabilities',
  'providerExpressionTargets',
  'executionMode',
  'thinkingBudget',
  'providerOptions',
  'workspaceRoot',
  'authorizedReadRoots',
  'workspaceIgnoreRules',
  'conversationId',
  'taskManager',
  'operationToolAdapterRegistry',
] as const satisfies readonly (keyof AgentTurnRunnerConfigureInput<unknown>)[];

export async function runAgentTurnRuntime<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext> = AgentTurnRunner<TPlatform, TContext>,
>(
  input: RunAgentTurnRuntimeInput<TPlatform, TContext, THistoryMessage, TProvider, TRunner>,
): Promise<RunAgentTurnRuntimeResult> {
  const now = input.now ?? Date.now;
  const postMessage = (message: AgentTurnHostMessage): void => {
    void input.postMessage(message);
  };
  const publishErrorMessage = (message: string): void => {
    const errorMessage = buildAgentErrorAssistantMessage({
      id: input.generateMessageId(),
      timestamp: now(),
      message,
    });
    input.onErrorMessage?.(errorMessage);
    postMessage(
      buildErrorMessage({
        conversationId: input.conversationId,
        message,
      }),
    );
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
    publishErrorMessage(getAgentTurnPreconditionMessage('no-provider-configured'));
    return { status: 'precondition-unmet', reason: 'no-provider-configured' };
  }

  try {
    const result = await executeAgentTurn({
      ...input,
      agentManager: input.agentManager,
      onToolConfirmation: (request) => {
        postMessage(buildToolConfirmationMessage(request));
      },
      onPhaseChange: postPhase,
      onMessageQueued: (event) => {
        postMessage({
          type: 'messageQueued',
          conversationId: event.conversationId,
          content: event.content,
          pendingCount: event.pendingCount,
        });
      },
      now,
    });

    if (result.status === 'precondition-unmet') {
      publishErrorMessage(getAgentTurnPreconditionMessage(result.reason));
    }

    return result;
  } catch (error) {
    input.onExecutionError?.(error);
    postPhase({
      conversationId: input.conversationId,
      phase: 'idle',
      timestamp: now(),
    });
    publishErrorMessage(error instanceof Error ? error.message : 'Failed to generate response');
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
  const startTime = Date.now();
  const logger = getAgentTurnRuntimeLogger();
  logger.debug('neko.agent.turn.execute.request', {
    conversationId: input.conversationId,
    messageChars: input.message.length,
    hasPlatform: input.platform !== undefined && input.platform !== null,
    hasChatModel: input.chatModel !== undefined,
    chatModel: input.chatModel,
    hasAgentModels: input.agentModels !== undefined,
    hasLlmConfig: input.llmConfig !== undefined,
    hasLlmRuntimeOptions: input.llmRuntimeOptions !== undefined,
    modelCapabilityCount: input.modelCapabilities?.length ?? 0,
    mediaModel: input.mediaModel,
    mediaModelCategories: input.mediaModels ? Object.keys(input.mediaModels) : [],
    imageAttachmentCount: input.imageAttachments?.length ?? 0,
    imageAttachmentSummary: summarizeTurnImages(input.imageAttachments),
    hasExecutionOverrides: input.executionOverrides !== undefined,
    executionMode: input.settings.executionMode,
    requestedProviderId: input.chatModel?.providerId,
    requestedModelId: input.chatModel?.modelId,
    hasActiveSkill: input.activeSkill !== undefined && input.activeSkill !== null,
    activeSkillName: input.activeSkill?.skill.name,
  });
  logger.debug('neko.agent.turn.execute.request.raw', {
    conversationId: input.conversationId,
    message: input.message,
    chatModel: input.chatModel,
    agentModels: input.agentModels,
    llmConfig: input.llmConfig,
    llmRuntimeOptions: input.llmRuntimeOptions,
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
    imageAttachments: summarizeTurnImages(input.imageAttachments),
    executionOverrides: input.executionOverrides,
    settings: input.settings,
    activeSkill: input.activeSkill,
  });

  const providerSelection = selectAgentTurnProvider({
    requestedProviderId: input.chatModel?.providerId,
    requestedModelId: input.chatModel?.modelId,
    requiredCapabilities: buildRequiredTurnCapabilities({
      imageAttachments: input.imageAttachments,
    }),
    getProvider: (providerId) => input.providerSource.getProvider(providerId),
  });
  if (providerSelection.ok === false) {
    logger.warn('neko.agent.turn.execute.failed', {
      conversationId: input.conversationId,
      durationMs: Date.now() - startTime,
      reason: providerSelection.reason,
      effectiveProviderId: providerSelection.effectiveProviderId,
      effectiveModelId: providerSelection.effectiveModelId,
    });
    return { status: 'precondition-unmet', reason: providerSelection.reason };
  }

  const platform = input.platform;
  if (!platform) {
    logger.warn('neko.agent.turn.execute.failed', {
      conversationId: input.conversationId,
      durationMs: Date.now() - startTime,
      reason: 'missing-platform',
      effectiveProviderId: providerSelection.effectiveProviderId,
    });
    return { status: 'precondition-unmet', reason: 'missing-platform' };
  }

  const now = input.now ?? Date.now;
  const workspaceRoot = input.getWorkspaceRoot?.();
  const authorizedReadRoots = input.getAuthorizedReadRoots?.();
  const workspaceIgnoreRules = input.getWorkspaceIgnoreRules?.();
  const ambientCanvas = input.getAmbientCanvas?.(input.conversationId) ?? [];
  const agentRunner = input.agentManager.getOrCreate(input.conversationId);
  const llmRuntimeOptions = input.llmRuntimeOptions;
  const usesProjectedLlmOptions = llmRuntimeOptions?.projected === true;

  const turnConfig = buildAgentTurnConfigurationPlan({
    conversationId: input.conversationId,
    baseSystemPrompt:
      input.settings.customSystemPrompt || input.getBaseSystemPrompt(input.conversationId),
    ambientCanvas,
    isPlanMode: input.isPlanMode(input.conversationId),
    executionMode: input.settings.executionMode,
    chatModel: {
      providerId: providerSelection.provider.id,
      modelId: providerSelection.effectiveModelId,
      category: 'llm',
    },
    executionOverrides: input.executionOverrides,
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
    maxIterations: 200,
    autoExecuteTools: input.settings.autoExecuteTools,
    temperature: usesProjectedLlmOptions
      ? llmRuntimeOptions.temperature
      : (llmRuntimeOptions?.temperature ?? input.settings.temperature),
    topP: usesProjectedLlmOptions
      ? llmRuntimeOptions.topP
      : (llmRuntimeOptions?.topP ?? input.settings.topP),
    maxTokens: usesProjectedLlmOptions
      ? llmRuntimeOptions.maxTokens
      : (llmRuntimeOptions?.maxTokens ?? input.settings.maxTokens),
    thinkingBudget: usesProjectedLlmOptions
      ? llmRuntimeOptions.thinkingBudget
      : (llmRuntimeOptions?.thinkingBudget ?? input.settings.thinkingBudget),
    providerOptions: llmRuntimeOptions?.providerOptions,
    workspaceRoot,
  });

  const runnerConfig: AgentTurnRunnerConfigureInput<TPlatform> = {
    platform,
    systemPrompt: turnConfig.systemPrompt,
    maxIterations: turnConfig.maxIterations,
    autoExecuteTools: turnConfig.autoExecuteTools,
    temperature: turnConfig.temperature,
    topP: turnConfig.topP,
    maxTokens: turnConfig.maxTokens,
    providerId: turnConfig.providerId,
    modelId: turnConfig.modelId,
    modelCapabilities: input.modelCapabilities,
    providerExpressionTargets: turnConfig.providerExpressionTargets,
    executionMode: turnConfig.executionMode,
    thinkingBudget: turnConfig.thinkingBudget,
    providerOptions: turnConfig.providerOptions,
    workspaceRoot: turnConfig.workspaceRoot,
    ...(authorizedReadRoots && authorizedReadRoots.length > 0 ? { authorizedReadRoots } : {}),
    ...(workspaceIgnoreRules ? { workspaceIgnoreRules } : {}),
    conversationId: turnConfig.conversationId,
    ...(input.taskManager ? { taskManager: input.taskManager } : {}),
  };

  if (agentRunner.isRunning()) {
    assertCompatibleRunningTurnConfig(agentRunner.getConfig(), runnerConfig);
    assertQueueableRunningTurn({ input, ambientCanvas });
    if (!agentRunner.appendMessage(input.message)) {
      throw new Error(AGENT_SESSION_BUSY_MESSAGE);
    }
    const pendingCount = agentRunner.getPendingMessagesCount();
    input.onMessageQueued?.({
      conversationId: input.conversationId,
      content: buildQueuedAgentMessageNotice(pendingCount),
      pendingCount,
    });
    logger.debug('neko.agent.turn.execute.queued', {
      conversationId: input.conversationId,
      durationMs: Date.now() - startTime,
      pendingCount,
    });
    return { status: 'queued', pendingCount };
  }

  await agentRunner.configure(runnerConfig);

  hydrateAgentHistoryIfNeeded({
    conversationId: input.conversationId,
    agentRunner,
    agentManager: input.agentManager,
    conversations: input.conversations,
  });

  synchronizeAgentTurnSkillState(agentRunner, input.activeSkill ?? null);

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

    let assistantMessage = await executeAgentTurnMessage({
      input,
      agentRunner,
      logger,
      startTime,
      workspaceRoot,
      ambientCanvas,
      turnConfig,
      now,
      message: input.message,
      imageAttachments: input.imageAttachments,
    });

    for (;;) {
      const queuedMessages = agentRunner.drainPendingMessages();
      if (queuedMessages.length === 0) {
        break;
      }

      for (const [index, queuedMessage] of queuedMessages.entries()) {
        input.onMessageQueued?.({
          conversationId: input.conversationId,
          pendingCount: queuedMessages.length - index - 1 + agentRunner.getPendingMessagesCount(),
        });

        assistantMessage = await executeAgentTurnMessage({
          input,
          agentRunner,
          logger,
          startTime,
          workspaceRoot,
          ambientCanvas,
          turnConfig,
          now,
          message: queuedMessage,
        });
      }
    }

    if (assistantMessage) {
      logger.debug('neko.agent.turn.execute.result', {
        conversationId: input.conversationId,
        durationMs: Date.now() - startTime,
        status: 'completed',
        assistantMessageChars: assistantMessage.content.length,
      });
      logger.debug('neko.agent.turn.execute.result.raw', {
        assistantMessage: sanitizeTurnDebugValue(assistantMessage),
      });
      return { status: 'completed', assistantMessage };
    }

    logger.debug('neko.agent.turn.execute.result', {
      conversationId: input.conversationId,
      durationMs: Date.now() - startTime,
      status: 'completed',
      assistantMessageChars: 0,
    });
    logger.debug('neko.agent.turn.execute.result.raw', {
      conversationId: input.conversationId,
    });
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

async function executeAgentTurnMessage<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext>,
>(input: {
  readonly input: ExecuteAgentTurnInput<TPlatform, TContext, THistoryMessage, TProvider, TRunner>;
  readonly agentRunner: TRunner;
  readonly logger: ReturnType<typeof getAgentTurnRuntimeLogger>;
  readonly startTime: number;
  readonly workspaceRoot?: string;
  readonly ambientCanvas: readonly AgentAmbientCanvasNode[];
  readonly turnConfig: AgentTurnConfigurationPlan;
  readonly now: () => number;
  readonly message: string;
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
}): Promise<Message | undefined> {
  const context = await input.input.createContext({
    conversationId: input.input.conversationId,
    message: input.message,
    workspaceRoot: input.workspaceRoot,
  });
  const timelineContextPacket = await input.input.buildTimelineContextPacket?.({
    context,
    message: input.message,
    workspaceRoot: input.workspaceRoot,
  });
  const canvasContextPacket =
    input.ambientCanvas.length > 0
      ? createCanvasSelectionContextPacket(input.ambientCanvas, {
          userAnnotation: input.message,
        })
      : null;
  const multimodalContextPacket = buildTurnMultimodalContextPacket({
    conversationId: input.input.conversationId,
    message: input.message,
    imageAttachments: input.imageAttachments,
    timelineContextPacket: isMultimodalContextPacket(timelineContextPacket)
      ? timelineContextPacket
      : null,
    canvasContextPacket,
    ...(input.input.workflow ? { workflow: input.input.workflow } : {}),
  });

  const contextPatch = buildAgentTurnContextPatch({
    imageAttachments: input.imageAttachments,
    timelineContextPacket,
    canvasNodes: input.ambientCanvas,
    canvasContextPacket,
    multimodalContextPacket,
    executionMetadata: input.turnConfig.executionMetadata,
  });
  input.logger.debug('neko.agent.turn.context.patch', {
    conversationId: input.input.conversationId,
    workspaceRoot: input.workspaceRoot,
    ambientCanvasCount: input.ambientCanvas.length,
    imageAttachmentCount: input.imageAttachments?.length ?? 0,
    hasTimelineContextPacket: timelineContextPacket !== undefined && timelineContextPacket !== null,
    hasCanvasContextPacket: canvasContextPacket !== undefined && canvasContextPacket !== null,
    hasMultimodalContextPacket: multimodalContextPacket !== undefined,
    contextPatchSummary: summarizeContextPatch(contextPatch),
    systemPromptChars: input.turnConfig.systemPrompt.length,
    providerExpressionTargetCount: input.turnConfig.providerExpressionTargets?.length ?? 0,
    providerExpressionTargets: input.turnConfig.providerExpressionTargets ?? [],
    executionMetadataKeys: input.turnConfig.executionMetadata
      ? Object.keys(input.turnConfig.executionMetadata)
      : [],
  });
  input.logger.debug('neko.agent.turn.context.patch.raw', {
    conversationId: input.input.conversationId,
    workspaceRoot: input.workspaceRoot,
    ambientCanvas: input.ambientCanvas,
    timelineContextPacket,
    canvasContextPacket,
    multimodalContextPacket: sanitizeTurnDebugValue(multimodalContextPacket),
    contextPatch: sanitizeTurnDebugValue(contextPatch),
    systemPrompt: input.turnConfig.systemPrompt,
  });
  applyAgentTurnContextPatch(context, contextPatch, input.input.applyContextPatch);

  const assistantMessageId = input.input.generateMessageId();
  const stream = await input.input.processStream({
    conversationId: input.input.conversationId,
    messageId: assistantMessageId,
    events: input.agentRunner.execute(input.message, context),
    onPhaseChange: (phase, toolName) => {
      input.input.onPhaseChange?.({
        conversationId: input.input.conversationId,
        phase,
        toolName,
        timestamp: input.now(),
      });
    },
  });

  const assistantMessage =
    buildAgentAssistantMessageFromStream({
      id: assistantMessageId,
      timestamp: input.now(),
      stream,
    }) ??
    buildEmptyAgentTurnErrorMessage({
      id: assistantMessageId,
      timestamp: input.now(),
      providerId: input.turnConfig.providerId,
      modelId: input.turnConfig.modelId,
    });
  if (assistantMessage) {
    input.input.conversations.addAssistantMessage(input.input.conversationId, assistantMessage);
  }

  input.logger.debug('neko.agent.turn.message.result', {
    conversationId: input.input.conversationId,
    durationMs: Date.now() - input.startTime,
    assistantMessageChars: assistantMessage?.content.length ?? 0,
    toolCallCount: stream.collectedToolCalls.length,
    contentBlockCount: stream.contentBlocks.length,
    hasThinking: stream.accumulatedThinking.length > 0,
  });
  input.logger.debug('neko.agent.turn.message.result.raw', {
    conversationId: input.input.conversationId,
    stream: sanitizeTurnDebugValue(stream),
    assistantMessage: sanitizeTurnDebugValue(assistantMessage),
  });

  return assistantMessage ?? undefined;
}

function buildEmptyAgentTurnErrorMessage(input: {
  readonly id: string;
  readonly timestamp: number;
  readonly providerId?: string;
  readonly modelId?: string;
}): Message {
  const modelLabel =
    input.providerId && input.modelId
      ? ` (${input.providerId}/${input.modelId})`
      : input.modelId
        ? ` (${input.modelId})`
        : '';
  return buildAgentErrorAssistantMessage({
    id: input.id,
    timestamp: input.timestamp,
    message: `The selected chat model${modelLabel} completed without returning text, tool calls, thinking, or an error. Please retry or choose another model.`,
  });
}

function assertCompatibleRunningTurnConfig<TPlatform>(
  currentConfig: unknown,
  nextConfig: AgentTurnRunnerConfigureInput<TPlatform>,
): void {
  if (!isRecord(currentConfig)) {
    throw new Error(AGENT_SESSION_CONFIG_LOCKED_MESSAGE);
  }

  for (const key of RUNNING_TURN_CONFIG_KEYS) {
    if (!isSameRunningTurnConfigValue(currentConfig[key], nextConfig[key])) {
      throw new Error(AGENT_SESSION_CONFIG_LOCKED_MESSAGE);
    }
  }
}

function isSameRunningTurnConfigValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined && right === undefined) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right) || isPlainRecord(left) || isPlainRecord(right)) {
    return stableJson(left) === stableJson(right);
  }
  return false;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertQueueableRunningTurn<
  TPlatform,
  TContext extends object,
  THistoryMessage,
  TProvider extends AgentProviderCandidate,
  TRunner extends AgentTurnRunner<TPlatform, TContext>,
>(params: {
  readonly input: ExecuteAgentTurnInput<TPlatform, TContext, THistoryMessage, TProvider, TRunner>;
  readonly ambientCanvas: readonly AgentAmbientCanvasNode[];
}): void {
  if ((params.input.imageAttachments?.length ?? 0) > 0) {
    throw new Error(AGENT_SESSION_BUSY_MESSAGE);
  }
  if (params.ambientCanvas.length > 0) {
    throw new Error(AGENT_SESSION_BUSY_MESSAGE);
  }
  const metadata = params.input.executionOverrides?.metadata;
  if (metadata && Object.keys(metadata).length > 0) {
    throw new Error(AGENT_SESSION_BUSY_MESSAGE);
  }
}

function buildQueuedAgentMessageNotice(pendingCount: number): string {
  return `Message queued (${pendingCount} pending)`;
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
  const agentHistory = input.agentRunner.getHistory();
  const hydrationPlan = buildAgentHistoryHydrationPlan({
    agentHistory: projectHydrationCandidateHistory(agentHistory),
    agentHistoryLength: agentHistory.length,
    conversationMessageCount: input.conversations.getConversationMessageCount(input.conversationId),
    fullHistory: input.conversations.getFullHistory(input.conversationId),
  });

  if (hydrationPlan.kind === 'load-history') {
    input.agentManager.loadHistoryWithContext(input.conversationId, hydrationPlan.historyToLoad);
  }
}

function projectHydrationCandidateHistory(
  history: readonly unknown[],
): readonly { readonly role: 'system' | 'user' | 'assistant' | 'tool' }[] | undefined {
  const projected = history.filter(isHydrationCandidateMessage);
  return projected.length === history.length ? projected : undefined;
}

function isHydrationCandidateMessage(
  value: unknown,
): value is { readonly role: 'system' | 'user' | 'assistant' | 'tool' } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const role = (value as { readonly role?: unknown }).role;
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool';
}

function synchronizeAgentTurnSkillState<TPlatform, TContext extends object>(
  agentRunner: AgentTurnRunner<TPlatform, TContext>,
  activeSkill: AgentTurnActiveSkillState | null,
): void {
  const runnerKey = agentRunner as object;
  const previousTurnSkillName = turnManagedSkillNames.get(runnerKey);

  if (activeSkill) {
    agentRunner.applySkillInjection?.(activeSkill.injection, activeSkill.skill);
    turnManagedSkillNames.set(runnerKey, activeSkill.skill.name);
    return;
  }

  if (!previousTurnSkillName) {
    return;
  }

  const currentSkillName = agentRunner.getActiveSkill?.()?.name;
  if (!currentSkillName || currentSkillName === previousTurnSkillName) {
    agentRunner.clearActiveSkill?.();
  }
  turnManagedSkillNames.delete(runnerKey);
}

function buildRequiredTurnCapabilities(input: {
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
}): string[] {
  const capabilities = new Set<string>();

  if ((input.imageAttachments?.length ?? 0) > 0) {
    capabilities.add('vision');
  }

  return [...capabilities];
}

function summarizeTurnImages(
  images: readonly AgentBase64ImageAttachment[] | undefined,
): readonly Record<string, unknown>[] {
  return (images ?? []).map((image, index) => ({
    index,
    type: image.type,
    mediaType: image.media_type,
    dataChars: image.data.length,
  }));
}

function summarizeContextPatch(
  patch: ReturnType<typeof buildAgentTurnContextPatch>,
): Record<string, unknown> {
  return {
    hasImageAttachments: patch.imageAttachments !== undefined,
    imageAttachmentCount: patch.imageAttachments?.length ?? 0,
    hasCanvasContext: patch.canvasContext !== undefined,
    canvasNodeCount: patch.canvasContext?.selectedNodes.length ?? 0,
    hasMultimodalContextPacket: patch.multimodalContextPacket !== undefined,
    metadataKeys: patch.metadata ? Object.keys(patch.metadata) : [],
  };
}

function sanitizeTurnDebugValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeTurnStringForDebugLog(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTurnDebugValue(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (isLikelyMediaDataKey(key) && typeof entry === 'string') {
        return [key, sanitizeTurnStringForDebugLog(entry)];
      }
      return [key, sanitizeTurnDebugValue(entry)];
    }),
  );
}

function isLikelyMediaDataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === 'data' ||
    normalized === 'imagedata' ||
    normalized === 'image' ||
    normalized === 'preview' ||
    normalized === 'thumbnail'
  );
}

function sanitizeTurnStringForDebugLog(value: string): string {
  if (value.startsWith('data:')) {
    const metadataEnd = value.indexOf(',');
    const metadata = metadataEnd >= 0 ? value.slice(0, metadataEnd) : 'data:';
    return `${metadata},<omitted ${value.length} chars>`;
  }

  if (value.length > 4096 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
    return `<base64 omitted ${value.length} chars>`;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
