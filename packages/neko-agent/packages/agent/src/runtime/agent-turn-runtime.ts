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
  buildAgentErrorAssistantMessage,
  buildAgentHistoryHydrationPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  getAgentTurnPreconditionMessage,
  selectAgentTurnProvider,
  type AgentAmbientCanvasNode,
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
    };

export type AgentTurnPreconditionReason = AgentMessageTurnPreconditionReason;
export type AgentTurnFallbackReason = AgentTurnPreconditionReason;

export {
  AGENT_TURN_FALLBACK_MESSAGE,
  AGENT_TURN_PRECONDITION_MESSAGE,
  getAgentTurnFallbackMessage,
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
  readonly onErrorMessage?: (message: Message) => void;
  readonly onExecutionError?: (error: unknown) => void;
}

export type RunAgentTurnForWebviewRuntimeResult =
  | AgentTurnExecutionResult
  | {
      readonly status: 'failed';
      readonly error: unknown;
    };

const turnManagedSkillNames = new WeakMap<object, string>();

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
    mediaModel: input.mediaModel,
    mediaModelCategories: input.mediaModels ? Object.keys(input.mediaModels) : [],
    imageAttachmentCount: input.imageAttachments?.length ?? 0,
    imageAttachmentSummary: summarizeTurnImages(input.imageAttachments),
    hasExecutionOverrides: input.executionOverrides !== undefined,
    executionMode: input.settings.executionMode,
    selectedProviderId: input.providerSource.selectedProviderId,
    requestedProviderId: input.providerSource.requestedProviderId,
    hasActiveSkill: input.activeSkill !== undefined && input.activeSkill !== null,
    activeSkillName: input.activeSkill?.skill.name,
  });
  logger.debug('neko.agent.turn.execute.request.raw', {
    conversationId: input.conversationId,
    message: input.message,
    chatModel: input.chatModel,
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
    imageAttachments: summarizeTurnImages(input.imageAttachments),
    executionOverrides: input.executionOverrides,
    settings: input.settings,
    activeSkill: input.activeSkill,
  });

  const providerSelection = selectAgentTurnProvider({
    requestedProviderId: input.providerSource.requestedProviderId ?? undefined,
    selectedProviderId: input.providerSource.selectedProviderId ?? undefined,
    getProvider: (providerId) => input.providerSource.getProvider(providerId),
    getDefaultProvider: () => input.providerSource.getDefaultProvider(),
  });
  if (providerSelection.ok === false) {
    logger.warn('neko.agent.turn.execute.failed', {
      conversationId: input.conversationId,
      durationMs: Date.now() - startTime,
      reason: providerSelection.reason,
      effectiveProviderId: providerSelection.effectiveProviderId,
    });
    return { status: 'precondition-unmet', reason: 'no-provider-configured' };
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
  const ambientCanvas = input.getAmbientCanvas?.(input.conversationId) ?? [];
  const agentRunner = input.agentManager.getOrCreate(input.conversationId);

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

  hydrateAgentHistoryIfNeeded({
    conversationId: input.conversationId,
    agentRunner,
    agentManager: input.agentManager,
    conversations: input.conversations,
  });

  synchronizeAgentTurnSkillState(agentRunner, input.activeSkill ?? null);

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
  logger.debug('neko.agent.turn.context.patch', {
    conversationId: input.conversationId,
    workspaceRoot,
    ambientCanvasCount: ambientCanvas.length,
    imageAttachmentCount: input.imageAttachments?.length ?? 0,
    hasTimelineContextPacket: timelineContextPacket !== undefined && timelineContextPacket !== null,
    hasCanvasContextPacket: canvasContextPacket !== undefined && canvasContextPacket !== null,
    hasMultimodalContextPacket: multimodalContextPacket !== undefined,
    contextPatchSummary: summarizeContextPatch(contextPatch),
    systemPromptChars: turnConfig.systemPrompt.length,
    providerExpressionTargetCount: turnConfig.providerExpressionTargets?.length ?? 0,
    providerExpressionTargets: turnConfig.providerExpressionTargets ?? [],
    executionMetadataKeys: turnConfig.executionMetadata
      ? Object.keys(turnConfig.executionMetadata)
      : [],
  });
  logger.debug('neko.agent.turn.context.patch.raw', {
    conversationId: input.conversationId,
    workspaceRoot,
    ambientCanvas,
    timelineContextPacket,
    canvasContextPacket,
    multimodalContextPacket: sanitizeTurnDebugValue(multimodalContextPacket),
    contextPatch: sanitizeTurnDebugValue(contextPatch),
    systemPrompt: turnConfig.systemPrompt,
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

    const assistantMessageId = input.generateMessageId();
    const stream = await input.processStream({
      conversationId: input.conversationId,
      messageId: assistantMessageId,
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
      id: assistantMessageId,
      timestamp: now(),
      stream,
    });
    if (assistantMessage) {
      input.conversations.addAssistantMessage(input.conversationId, assistantMessage);
      logger.debug('neko.agent.turn.execute.result', {
        conversationId: input.conversationId,
        durationMs: Date.now() - startTime,
        status: 'completed',
        assistantMessageChars: assistantMessage.content.length,
        toolCallCount: stream.collectedToolCalls.length,
        contentBlockCount: stream.contentBlocks.length,
        hasThinking: stream.accumulatedThinking.length > 0,
      });
      logger.debug('neko.agent.turn.execute.result.raw', {
        conversationId: input.conversationId,
        stream: sanitizeTurnDebugValue(stream),
        assistantMessage: sanitizeTurnDebugValue(assistantMessage),
      });
      return { status: 'completed', assistantMessage };
    }

    logger.debug('neko.agent.turn.execute.result', {
      conversationId: input.conversationId,
      durationMs: Date.now() - startTime,
      status: 'completed',
      assistantMessageChars: 0,
      toolCallCount: stream.collectedToolCalls.length,
      contentBlockCount: stream.contentBlocks.length,
      hasThinking: stream.accumulatedThinking.length > 0,
    });
    logger.debug('neko.agent.turn.execute.result.raw', {
      conversationId: input.conversationId,
      stream: sanitizeTurnDebugValue(stream),
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
