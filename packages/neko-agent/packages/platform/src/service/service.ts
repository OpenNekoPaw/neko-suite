/**
 * AI Service - Unified interface for AI operations
 *
 * Simplified to direct adapter calls. Vercel AI SDK handles retries internally.
 * Circuit breaker, rate limiting, and multi-model fallback have been removed
 * as they are unnecessary for a single-user desktop application.
 */

import type {
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  MessageRole,
} from '../types/adapter';
import type {
  ServiceOptions,
  ServiceCallContext,
  ServiceResponse,
  ServiceStreamResponse,
  ModelCallRecord,
  ModelCallRecorder,
  EmbeddingOptions,
  EmbeddingResponse,
} from '../types/service';
import {
  calculateBackoff,
  deriveAgentTraceContext,
  resolveAgentTokenBudget,
  sleepWithAbort,
  withAgentTrace,
} from '@neko/shared';
import type { IService } from '../types/interfaces';
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from '../provider/provider-registry';
import { ModelSelector } from './model-selector';
import { PlatformError } from '../provider/platform-error';
import { createStreamCollector } from '../llm/adapter/stream-aggregator';
import { getLogger } from '../utils/logger';
import { HttpClientError } from '../core/http-client';
import type { PlatformErrorCategory, RetryPolicy, RetryTimeoutPreset } from '../types/error';

/**
 * AI Service configuration
 */
export interface ServiceConfig {
  configManager: ConfigManager;
  providerRegistry: ProviderRegistry;
  modelCallRecorder?: ModelCallRecorder;
}

/**
 * Resolved model for a request
 */
interface RoutingResult {
  modelId: string;
  providerId: string;
  attempt: number;
}

/**
 * Resolved resources for a routing result
 */
interface ResolvedResources {
  model: import('../types/provider').Model;
  provider: import('../types/provider').Provider;
  adapter: import('../types/adapter').Adapter;
}

/**
 * AI Service - Main entry point for AI operations
 *
 * Implements IService interface for dependency inversion.
 */
export class Service implements IService {
  private config: ServiceConfig;
  private selector: ModelSelector;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.selector = new ModelSelector(config.configManager, config.providerRegistry);
  }

  // ==========================================================================
  // Private Routing Helpers
  // ==========================================================================

  /**
   * Resolve model for a chat or embedding request
   */
  private resolveRouting(
    providerId?: string,
    modelId?: string,
    excludeModels: string[] = [],
    taskType: 'chat' | 'embedding' = 'chat',
  ): RoutingResult {
    if (taskType === 'chat') {
      assertExplicitChatRouting(providerId, modelId);
    }
    return this.selector.resolve(taskType, { providerId, modelId, excludeModels });
  }

  /**
   * Resolve model, provider, and adapter from routing result
   */
  private resolveResources(routing: RoutingResult): ResolvedResources {
    const model = this.config.configManager.getModel(routing.modelId);
    if (!model) {
      throw new PlatformError({
        category: 'not_found',
        code: 'MODEL_NOT_FOUND',
        message: `Model ${routing.modelId} not found`,
        retryable: false,
      });
    }

    const provider = this.config.configManager.getProvider(routing.providerId);
    if (!provider) {
      throw new PlatformError({
        category: 'not_found',
        code: 'PROVIDER_NOT_FOUND',
        message: `Provider ${routing.providerId} not found`,
        retryable: false,
      });
    }

    // Pass model to allow model-specific protocol override
    const adapter = this.config.providerRegistry.getAdapter(routing.providerId, model);
    if (!adapter) {
      throw new PlatformError({
        category: 'not_found',
        code: 'ADAPTER_NOT_FOUND',
        message: `Adapter for provider ${routing.providerId} not found`,
        retryable: false,
      });
    }

    return { model, provider, adapter };
  }

  /**
   * Build response metadata with routing and timing info
   */
  private buildResponseMeta(
    routing: RoutingResult,
    startTime: number,
  ): { routing: ServiceResponse['routing']; timing: ServiceResponse['timing'] } {
    const endTime = Date.now();
    return {
      routing: {
        modelId: routing.modelId,
        providerId: routing.providerId,
        attempts: routing.attempt,
      },
      timing: {
        startTime,
        endTime,
        duration: endTime - startTime,
      },
    };
  }

  // ==========================================================================
  // Chat Methods
  // ==========================================================================

  /**
   * Send a chat request
   */
  async chat(
    messages: ChatMessage[],
    options: ServiceOptions = {},
    context?: ServiceCallContext,
  ): Promise<ServiceResponse> {
    this.config.configManager.assertConfigAvailable();
    const startTime = Date.now();
    const requestId = createModelCallRequestId(startTime);
    const logger = getServiceLogger();
    const trace = deriveAgentTraceContext(context?.trace, {
      phase: 'llm',
      llmRequestId: requestId,
    });
    const routing = this.resolveRouting(options.providerId, options.modelId, [], 'chat');
    const { model, provider, adapter } = this.resolveResources(routing);

    const chatOptions = resolveProviderChatOptions(options, model);
    try {
      const projectedMessages = await projectMessagesForProvider(messages, chatOptions, {
        providerId: routing.providerId,
        modelId: routing.modelId,
      });
      const requestLog = createModelCallRequestLog({
        requestId,
        stream: false,
        routing,
        options: chatOptions,
        originalMessages: messages,
        projectedMessages,
      });
      const requestDebugLog = createModelCallRequestDebugLog({
        requestId,
        stream: false,
        routing,
        options: chatOptions,
        originalMessages: messages,
        projectedMessages,
      });
      logger.debug('neko.agent.llm.request', withAgentTrace(trace, requestLog));
      logger.debug('neko.agent.llm.request.raw', withAgentTrace(trace, requestDebugLog));
      recordModelCall(logger, this.config.modelCallRecorder, {
        kind: 'request',
        requestId,
        stream: false,
        routing,
        trace,
        payload: requestDebugLog,
      });

      const response = await adapter.chat(projectedMessages, chatOptions, model, provider);
      const responseMeta = this.buildResponseMeta(routing, startTime);
      const responseLog = createModelCallResponseLog({
        requestId,
        stream: false,
        routing,
        durationMs: responseMeta.timing.duration,
        response,
      });
      const responseDebugLog = createModelCallResponseDebugLog({
        requestId,
        stream: false,
        routing,
        response,
      });
      logger.debug('neko.agent.llm.response', withAgentTrace(trace, responseLog));
      logger.debug('neko.agent.llm.response.raw', withAgentTrace(trace, responseDebugLog));
      recordModelCall(logger, this.config.modelCallRecorder, {
        kind: 'response',
        requestId,
        stream: false,
        routing,
        trace,
        payload: responseDebugLog,
      });
      return { ...response, ...responseMeta };
    } catch (error) {
      const failureLog = createModelCallFailureLog({
        requestId,
        stream: false,
        routing,
        durationMs: Date.now() - startTime,
        error,
      });
      logger.warn('neko.agent.llm.failed', withAgentTrace(trace, failureLog));
      recordModelCall(logger, this.config.modelCallRecorder, {
        kind: 'failure',
        requestId,
        stream: false,
        routing,
        trace,
        payload: failureLog,
      });
      throw error;
    }
  }

  /**
   * Send a streaming chat request
   */
  chatStream(
    messages: ChatMessage[],
    options: ServiceOptions = {},
    context?: ServiceCallContext,
  ): ServiceStreamResponse {
    this.config.configManager.assertConfigAvailable();
    const startTime = Date.now();
    const requestId = createModelCallRequestId(startTime);
    const logger = getServiceLogger();
    const trace = deriveAgentTraceContext(context?.trace, {
      phase: 'llm',
      llmRequestId: requestId,
    });
    const routing = this.resolveRouting(options.providerId, options.modelId, [], 'chat');
    const { model, provider, adapter } = this.resolveResources(routing);

    const chatOptions = resolveProviderChatOptions({ ...options, stream: true }, model);
    // Apply stream timeout if configured
    const timeoutMs = this.getStreamTimeout();
    const createStream = () => {
      const rawStream = createProjectedChatStream({
        messages,
        options: chatOptions,
        providerId: routing.providerId,
        modelId: routing.modelId,
        onProjected: (projectedMessages) => {
          const requestLog = createModelCallRequestLog({
            requestId,
            stream: true,
            routing,
            options: chatOptions,
            originalMessages: messages,
            projectedMessages,
          });
          const requestDebugLog = createModelCallRequestDebugLog({
            requestId,
            stream: true,
            routing,
            options: chatOptions,
            originalMessages: messages,
            projectedMessages,
          });
          logger.debug('neko.agent.llm.request', withAgentTrace(trace, requestLog));
          logger.debug('neko.agent.llm.request.raw', withAgentTrace(trace, requestDebugLog));
          recordModelCall(logger, this.config.modelCallRecorder, {
            kind: 'request',
            requestId,
            stream: true,
            routing,
            trace,
            payload: requestDebugLog,
          });
        },
        start: (projectedMessages) =>
          adapter.chatStream(projectedMessages, chatOptions, model, provider),
      });

      return timeoutMs ? this.withStreamTimeout(rawStream, timeoutMs) : rawStream;
    };
    const retryPreset = shouldUseServiceManagedStreamRetry(adapter)
      ? this.getModelCallRetryPreset()
      : undefined;
    const stream = retryPreset
      ? this.withInitialStreamRetry({
          createStream,
          retryPolicy: retryPreset.retry,
          totalTimeoutMs: retryPreset.timeout.totalTimeout,
          signal: options.signal,
          routing,
          requestId,
          logger,
          trace,
        })
      : createStream();

    const { stream: collectedStream, response: responsePromise } = createStreamCollector(stream);

    return {
      stream: collectedStream,
      response: responsePromise
        .then((response) => {
          const responseMeta = this.buildResponseMeta(routing, startTime);
          const responseLog = createModelCallResponseLog({
            requestId,
            stream: true,
            routing,
            durationMs: responseMeta.timing.duration,
            response,
          });
          const responseDebugLog = createModelCallResponseDebugLog({
            requestId,
            stream: true,
            routing,
            response,
          });
          logger.debug('neko.agent.llm.response', withAgentTrace(trace, responseLog));
          logger.debug('neko.agent.llm.response.raw', withAgentTrace(trace, responseDebugLog));
          recordModelCall(logger, this.config.modelCallRecorder, {
            kind: 'response',
            requestId,
            stream: true,
            routing,
            trace,
            payload: responseDebugLog,
          });
          return {
            ...response,
            ...responseMeta,
          };
        })
        .catch((error: unknown) => {
          const failureLog = createModelCallFailureLog({
            requestId,
            stream: true,
            routing,
            durationMs: Date.now() - startTime,
            error,
          });
          logger.warn('neko.agent.llm.failed', withAgentTrace(trace, failureLog));
          recordModelCall(logger, this.config.modelCallRecorder, {
            kind: 'failure',
            requestId,
            stream: true,
            routing,
            trace,
            payload: failureLog,
          });
          throw error;
        }),
    };
  }

  /**
   * Generate embeddings
   */
  async embed(
    input: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    this.config.configManager.assertConfigAvailable();
    const routing = this.resolveRouting(options.providerId, options.modelId, [], 'embedding');
    const { model, provider, adapter } = this.resolveResources(routing);

    if (!adapter.embed) {
      throw new PlatformError({
        category: 'validation',
        code: 'EMBEDDING_NOT_SUPPORTED',
        message: `Provider ${routing.providerId} does not support embeddings`,
        retryable: false,
      });
    }

    const embeddings = await adapter.embed(input, model, provider);
    const inputs = Array.isArray(input) ? input : [input];

    return {
      embeddings,
      model: model.id,
      usage: {
        promptTokens: inputs.reduce((sum, i) => sum + i.length / 4, 0),
        totalTokens: inputs.reduce((sum, i) => sum + i.length / 4, 0),
      },
    };
  }

  // ==========================================================================
  // Provider Model Discovery
  // ==========================================================================

  /**
   * List available models from a provider's API
   */
  async listProviderModels(providerId: string): Promise<string[]> {
    const models = await this.listProviderModelsDetailed(providerId);
    return models.map((m) => m.id);
  }

  /**
   * List available models with detailed capability information
   */
  async listProviderModelsDetailed(
    providerId: string,
  ): Promise<import('../types/adapter').ModelInfo[]> {
    const provider = this.config.configManager.getProvider(providerId);
    if (!provider) {
      throw new PlatformError({
        category: 'not_found',
        code: 'PROVIDER_NOT_FOUND',
        message: `Provider ${providerId} not found`,
        retryable: false,
      });
    }

    const adapter = this.config.providerRegistry.getAdapter(providerId);
    if (!adapter) {
      throw new PlatformError({
        category: 'not_found',
        code: 'ADAPTER_NOT_FOUND',
        message: `Adapter for provider ${providerId} not found`,
        retryable: false,
      });
    }

    // Prefer detailed listing if available
    if (adapter.listModelsDetailed) {
      return adapter.listModelsDetailed(provider);
    }

    // Fallback to simple listing with default capabilities
    if (adapter.listModels) {
      const modelIds = await adapter.listModels(provider);
      return modelIds.map((id) => ({
        id,
        capabilities: ['chat'] as import('../types/adapter').ModelInfoCapability[],
      }));
    }

    throw new PlatformError({
      category: 'validation',
      code: 'LIST_MODELS_NOT_SUPPORTED',
      message: `Provider ${providerId} does not support model listing`,
      retryable: false,
    });
  }

  /**
   * Check if a provider supports listing models from its API
   */
  supportsModelListing(providerId: string): boolean {
    const adapter = this.config.providerRegistry.getAdapter(providerId);
    return !!(adapter?.listModels || adapter?.listModelsDetailed);
  }

  // ===========================================================================
  // API Key Validation
  // ===========================================================================

  /**
   * Validate a provider's API key
   */
  async validateProviderApiKey(
    providerId: string,
    modelId?: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const provider = this.config.configManager.getProvider(providerId);
    if (!provider) {
      return { valid: false, error: `Provider '${providerId}' not found` };
    }

    const adapter = this.config.providerRegistry.getAdapter(providerId);
    if (!adapter) {
      return { valid: false, error: `Adapter for '${providerId}' not found` };
    }

    if (!adapter.validateApiKey) {
      return { valid: false, error: 'API key validation not supported for this provider' };
    }

    // Get model name if modelId is specified
    let modelName: string | undefined;
    if (modelId) {
      const model = this.config.configManager.getModel(modelId);
      if (model) {
        modelName = model.name;
      } else {
        modelName = modelId;
      }
    }

    try {
      return await adapter.validateApiKey(provider, modelName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: message };
    }
  }

  /**
   * Check if a provider supports API key validation
   */
  supportsApiKeyValidation(providerId: string): boolean {
    const adapter = this.config.providerRegistry.getAdapter(providerId);
    return !!adapter?.validateApiKey;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get stream timeout from config
   */
  private getStreamTimeout(): number | undefined {
    const preset = this.config.configManager.getRetryTimeoutPreset('modelCall');
    return preset?.timeout?.streamTimeout;
  }

  private getModelCallRetryPreset(): RetryTimeoutPreset | undefined {
    return this.config.configManager.getRetryTimeoutPreset('modelCall');
  }

  /**
   * Retry model streams only before the first provider chunk is emitted.
   * Once a provider has emitted text, reasoning, usage, or tool calls, replaying
   * the request can duplicate user-visible output or side effects.
   */
  private async *withInitialStreamRetry(input: {
    readonly createStream: () => AsyncIterable<ChatChunk>;
    readonly retryPolicy?: RetryPolicy;
    readonly totalTimeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly routing: RoutingResult;
    readonly requestId: string;
    readonly logger: ReturnType<typeof getServiceLogger>;
    readonly trace: ReturnType<typeof deriveAgentTraceContext>;
  }): AsyncIterable<ChatChunk> {
    const startTime = Date.now();
    let retries = 0;

    while (true) {
      let emittedChunk = false;
      try {
        for await (const chunk of input.createStream()) {
          emittedChunk = true;
          yield chunk;
        }
        return;
      } catch (error) {
        const normalized = normalizeModelCallStreamError(error, input.routing);
        if (
          emittedChunk ||
          !canRetryInitialModelCall({
            error: normalized,
            retryPolicy: input.retryPolicy,
            retries,
            signal: input.signal,
          })
        ) {
          throw retries > 0
            ? createModelCallRetryExhaustedError(normalized, input.routing, retries + 1)
            : normalized;
        }

        const delayMs = getModelCallRetryDelayMs(normalized, input.retryPolicy, retries);
        if (
          input.totalTimeoutMs !== undefined &&
          Date.now() - startTime + delayMs > input.totalTimeoutMs
        ) {
          throw retries > 0
            ? createModelCallRetryExhaustedError(normalized, input.routing, retries + 1)
            : normalized;
        }

        input.logger.warn(
          'neko.agent.llm.retry',
          withAgentTrace(input.trace, {
            requestId: input.requestId,
            providerId: input.routing.providerId,
            modelId: input.routing.modelId,
            stream: true,
            retry: retries + 1,
            maxRetries: input.retryPolicy?.maxRetries,
            nextAttempt: retries + 2,
            delayMs,
            error: summarizeError(normalized),
          }),
        );
        await sleepWithAbort(delayMs, input.signal);
        retries += 1;
      }
    }
  }

  /**
   * Wrap stream with timeout detection (detects stalled streams)
   */
  private async *withStreamTimeout<T>(
    stream: AsyncIterable<T>,
    timeoutMs: number,
  ): AsyncIterable<T> {
    let lastChunkTime = Date.now();

    for await (const chunk of stream) {
      const now = Date.now();
      const sinceLastChunk = now - lastChunkTime;

      if (sinceLastChunk > timeoutMs) {
        throw new PlatformError({
          category: 'timeout',
          code: 'STREAM_TIMEOUT',
          message: `No data received for ${timeoutMs}ms`,
          retryable: true,
        });
      }

      lastChunkTime = now;
      yield chunk;
    }
  }
}

function assertExplicitChatRouting(providerId: string | undefined, modelId: string | undefined) {
  if (providerId && modelId) {
    return;
  }

  if (providerId || modelId) {
    throw new PlatformError({
      category: 'validation',
      code: 'CHAT_MODEL_SELECTION_INCOMPLETE',
      message: 'Chat requests require both providerId and modelId. Refusing partial model routing.',
      retryable: false,
    });
  }

  throw new PlatformError({
    category: 'validation',
    code: 'CHAT_MODEL_SELECTION_REQUIRED',
    message:
      'Chat requests require an explicit providerId and modelId. Refusing default model routing.',
    retryable: false,
  });
}

async function projectMessagesForProvider(
  messages: ChatMessage[],
  options: ChatOptions,
  routing: { providerId: string; modelId: string },
): Promise<ChatMessage[]> {
  if (!options.messageProjector) {
    return messages;
  }

  const projected = await options.messageProjector({
    messages,
    providerId: routing.providerId,
    modelId: routing.modelId,
    modelCapabilities: options.modelCapabilities,
    locale: options.locale,
  });
  return [...projected];
}

function createProjectedChatStream(input: {
  readonly messages: ChatMessage[];
  readonly options: ChatOptions;
  readonly providerId: string;
  readonly modelId: string;
  readonly onProjected?: (messages: ChatMessage[]) => void;
  readonly start: (messages: ChatMessage[]) => AsyncIterable<ChatChunk>;
}): AsyncIterable<ChatChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const projectedMessages = await projectMessagesForProvider(input.messages, input.options, {
        providerId: input.providerId,
        modelId: input.modelId,
      });
      input.onProjected?.(projectedMessages);
      yield* input.start(projectedMessages);
    },
  };
}

function shouldUseServiceManagedStreamRetry(adapter: import('../types/adapter').Adapter): boolean {
  return adapter.type === 'generic' || adapter.type === 'azure' || adapter.type === 'ollama';
}

function resolveProviderChatOptions(
  options: ServiceOptions,
  model: import('../types/provider').Model,
): ChatOptions {
  const chatOptions: ChatOptions = { ...options, model: model.name };
  if (options.maxTokens === undefined) {
    return chatOptions;
  }

  const budget = resolveAgentTokenBudget({
    modelId: model.id,
    contextWindow: model.contextWindow,
    modelMaxOutputTokens: model.maxOutputTokens,
    defaultMaxOutputTokens: options.maxTokens,
    requestedMaxOutputTokens: options.maxTokens,
    reasoningReserveTokens: options.thinkingBudget,
  });
  const error = budget.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (error) {
    throw new PlatformError({
      category: 'validation',
      code: 'TOKEN_BUDGET_INVALID',
      message: `${error.message} Configure [defaults].max_tokens as an output cap, models[].context_window as the input context window, and models[].max_output_tokens as the model output cap.`,
      retryable: false,
      context: {
        modelId: model.id,
        diagnostics: budget.diagnostics,
      },
    });
  }

  return {
    ...chatOptions,
    maxTokens: budget.effectiveMaxOutputTokens,
  };
}

interface ChatMessageSummary {
  readonly messageCount: number;
  readonly roleCounts: Record<MessageRole, number>;
  readonly stringContentMessages: number;
  readonly partContentMessages: number;
  readonly textPartCount: number;
  readonly imagePartCount: number;
  readonly videoPartCount: number;
  readonly textChars: number;
  readonly toolCallCount: number;
  readonly toolCallNames: readonly string[];
}

interface ModelCallOptionsSummary {
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly frequencyPenalty?: number;
  readonly presencePenalty?: number;
  readonly stopSequenceCount: number;
  readonly toolCount: number;
  readonly toolNames: readonly string[];
  readonly toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  readonly responseFormat?: NonNullable<ChatOptions['responseFormat']>['type'];
  readonly thinkingBudget?: number;
  readonly modelCapabilityCount: number;
  readonly systemPromptSectionCount: number;
  readonly cachedSystemPromptSectionCount: number;
  readonly hasAbortSignal: boolean;
  readonly hasMessageProjector: boolean;
}

interface ErrorSummary {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly category?: string;
  readonly retryable?: boolean;
  readonly statusCode?: number;
  readonly url?: string;
  readonly cause?: ErrorSummary;
}

interface RawMessageSnapshot {
  readonly index: number;
  readonly role: MessageRole;
  readonly name?: string;
  readonly reasoningContent?: string;
  readonly toolCallId?: string;
  readonly content: RawContentSnapshot;
  readonly toolCalls?: readonly RawToolCallSnapshot[];
}

type RawContentSnapshot = string | readonly RawContentPartSnapshot[];

type RawContentPartSnapshot =
  | {
      readonly type: 'text';
      readonly text: string;
    }
  | {
      readonly type: 'image';
      readonly imageUrl: string;
      readonly detail?: 'auto' | 'low' | 'high';
    }
  | {
      readonly type: 'video';
      readonly videoUrl: string;
      readonly mimeType?: string;
    };

interface RawToolCallSnapshot {
  readonly id: string;
  readonly type: 'function';
  readonly functionName: string;
  readonly arguments: string;
}

let modelCallSequence = 0;

function getServiceLogger() {
  return getLogger('Service');
}

function createModelCallRequestId(now = Date.now()): string {
  modelCallSequence = modelCallSequence >= Number.MAX_SAFE_INTEGER ? 1 : modelCallSequence + 1;
  return `llm-${now.toString(36)}-${modelCallSequence.toString(36)}`;
}

function recordModelCall(
  logger: ReturnType<typeof getServiceLogger>,
  recorder: ModelCallRecorder | undefined,
  input: {
    readonly kind: ModelCallRecord['kind'];
    readonly requestId: string;
    readonly stream: boolean;
    readonly routing: RoutingResult;
    readonly trace: ReturnType<typeof deriveAgentTraceContext>;
    readonly payload: Record<string, unknown>;
  },
): void {
  if (!recorder) {
    return;
  }

  const record: ModelCallRecord = {
    schema: 'neko.model-call.v1',
    kind: input.kind,
    requestId: input.requestId,
    timestamp: Date.now(),
    providerId: input.routing.providerId,
    modelId: input.routing.modelId,
    stream: input.stream,
    attempt: input.routing.attempt,
    trace: input.trace,
    payload: input.payload,
  };

  try {
    const result = recorder.record(record);
    if (isPromiseLike(result)) {
      result.catch((error: unknown) => {
        logger.warn('neko.agent.llm.record.failed', {
          requestId: input.requestId,
          kind: input.kind,
          error: summarizeError(error),
        });
      });
    }
  } catch (error) {
    logger.warn('neko.agent.llm.record.failed', {
      requestId: input.requestId,
      kind: input.kind,
      error: summarizeError(error),
    });
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function createModelCallRequestLog(input: {
  readonly requestId: string;
  readonly stream: boolean;
  readonly routing: RoutingResult;
  readonly options: ChatOptions;
  readonly originalMessages: readonly ChatMessage[];
  readonly projectedMessages: readonly ChatMessage[];
}): Record<string, unknown> {
  const originalSummary = summarizeChatMessages(input.originalMessages);
  const projectedSummary = summarizeChatMessages(input.projectedMessages);

  return {
    requestId: input.requestId,
    providerId: input.routing.providerId,
    modelId: input.routing.modelId,
    stream: input.stream,
    attempt: input.routing.attempt,
    options: summarizeModelCallOptions(input.options),
    originalMessages: originalSummary,
    projectedMessages: projectedSummary,
    projectionDelta: {
      messageCount: input.projectedMessages.length - input.originalMessages.length,
      textChars: projectedSummary.textChars - originalSummary.textChars,
    },
  };
}

function createModelCallResponseLog(input: {
  readonly requestId: string;
  readonly stream: boolean;
  readonly routing: RoutingResult;
  readonly durationMs: number;
  readonly response: ChatResponse;
}): Record<string, unknown> {
  return {
    requestId: input.requestId,
    providerId: input.routing.providerId,
    modelId: input.routing.modelId,
    stream: input.stream,
    attempt: input.routing.attempt,
    durationMs: input.durationMs,
    responseId: input.response.id,
    providerModel: input.response.model,
    finishReason: input.response.finishReason,
    usage: input.response.usage,
    outputChars: countContentChars(input.response.message.content),
    toolCallCount: input.response.message.toolCalls?.length ?? 0,
    toolCallNames: input.response.message.toolCalls?.map((call) => call.function.name) ?? [],
    hasThinking: input.response.thinking !== undefined,
  };
}

function createModelCallRequestDebugLog(input: {
  readonly requestId: string;
  readonly stream: boolean;
  readonly routing: RoutingResult;
  readonly options: ChatOptions;
  readonly originalMessages: readonly ChatMessage[];
  readonly projectedMessages: readonly ChatMessage[];
}): Record<string, unknown> {
  return {
    requestId: input.requestId,
    providerId: input.routing.providerId,
    modelId: input.routing.modelId,
    stream: input.stream,
    attempt: input.routing.attempt,
    debugPayloadIncludesRawText: true,
    debugPayloadMediaPolicy: 'image/video URLs are preserved only for non-data URLs',
    systemPromptSections: input.options.systemPromptSections?.map((section, index) => ({
      index,
      cacheControl: section.cacheControl,
      content: section.content,
    })),
    originalMessages: createRawMessageSnapshots(input.originalMessages),
    projectedMessages: createRawMessageSnapshots(input.projectedMessages),
    tools: input.options.tools?.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    })),
    toolChoice: summarizeToolChoice(input.options.toolChoice),
    locale: input.options.locale,
  };
}

function createModelCallResponseDebugLog(input: {
  readonly requestId: string;
  readonly stream: boolean;
  readonly routing: RoutingResult;
  readonly response: ChatResponse;
}): Record<string, unknown> {
  return {
    requestId: input.requestId,
    providerId: input.routing.providerId,
    modelId: input.routing.modelId,
    stream: input.stream,
    attempt: input.routing.attempt,
    responseId: input.response.id,
    providerModel: input.response.model,
    finishReason: input.response.finishReason,
    usage: input.response.usage,
    message: createRawMessageSnapshot(input.response.message, 0),
    thinking: input.response.thinking,
  };
}

function createModelCallFailureLog(input: {
  readonly requestId: string;
  readonly stream: boolean;
  readonly routing: RoutingResult;
  readonly durationMs: number;
  readonly error: unknown;
}): Record<string, unknown> {
  return {
    requestId: input.requestId,
    providerId: input.routing.providerId,
    modelId: input.routing.modelId,
    stream: input.stream,
    attempt: input.routing.attempt,
    durationMs: input.durationMs,
    error: summarizeError(input.error),
  };
}

function createRawMessageSnapshots(
  messages: readonly ChatMessage[],
): readonly RawMessageSnapshot[] {
  return messages.map((message, index) => createRawMessageSnapshot(message, index));
}

function createRawMessageSnapshot(message: ChatMessage, index: number): RawMessageSnapshot {
  return {
    index,
    role: message.role,
    name: message.name,
    toolCallId: message.toolCallId,
    content: createRawContentSnapshot(message.content),
    toolCalls: message.toolCalls?.map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type,
      functionName: toolCall.function.name,
      arguments: toolCall.function.arguments,
    })),
    reasoningContent: message.reasoningContent,
  };
}

function createRawContentSnapshot(content: ChatMessage['content']): RawContentSnapshot {
  if (typeof content === 'string') {
    return content;
  }

  return content.map((part) => {
    switch (part.type) {
      case 'text':
        return {
          type: 'text',
          text: part.text,
        };
      case 'image':
        return {
          type: 'image',
          imageUrl: sanitizeMediaUrlForDebugLog(part.imageUrl),
          detail: part.detail,
        };
      case 'video':
        return {
          type: 'video',
          videoUrl: sanitizeMediaUrlForDebugLog(part.videoUrl),
          mimeType: part.mimeType,
        };
    }
  });
}

function summarizeModelCallOptions(options: ChatOptions): ModelCallOptionsSummary {
  const toolNames = options.tools?.map((tool) => tool.function.name) ?? [];
  const systemPromptSections = options.systemPromptSections ?? [];

  return {
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
    frequencyPenalty: options.frequencyPenalty,
    presencePenalty: options.presencePenalty,
    stopSequenceCount: options.stop?.length ?? 0,
    toolCount: toolNames.length,
    toolNames,
    toolChoice: summarizeToolChoice(options.toolChoice),
    responseFormat: options.responseFormat?.type,
    thinkingBudget: options.thinkingBudget,
    modelCapabilityCount: options.modelCapabilities?.length ?? 0,
    systemPromptSectionCount: systemPromptSections.length,
    cachedSystemPromptSectionCount: systemPromptSections.filter(
      (section) => section.cacheControl === 'ephemeral',
    ).length,
    hasAbortSignal: options.signal !== undefined,
    hasMessageProjector: options.messageProjector !== undefined,
  };
}

function summarizeToolChoice(
  toolChoice: ChatOptions['toolChoice'],
): ModelCallOptionsSummary['toolChoice'] {
  if (toolChoice === undefined || typeof toolChoice === 'string') {
    return toolChoice;
  }

  return {
    type: 'function',
    name: toolChoice.function.name,
  };
}

function summarizeChatMessages(messages: readonly ChatMessage[]): ChatMessageSummary {
  const roleCounts: Record<MessageRole, number> = {
    system: 0,
    user: 0,
    assistant: 0,
    tool: 0,
  };
  const toolCallNames: string[] = [];
  let stringContentMessages = 0;
  let partContentMessages = 0;
  let textPartCount = 0;
  let imagePartCount = 0;
  let videoPartCount = 0;
  let textChars = 0;
  let toolCallCount = 0;

  for (const message of messages) {
    roleCounts[message.role] += 1;

    if (typeof message.content === 'string') {
      stringContentMessages += 1;
      textChars += message.content.length;
    } else {
      partContentMessages += 1;
      for (const part of message.content) {
        switch (part.type) {
          case 'text':
            textPartCount += 1;
            textChars += part.text.length;
            break;
          case 'image':
            imagePartCount += 1;
            break;
          case 'video':
            videoPartCount += 1;
            break;
        }
      }
    }

    if (message.toolCalls) {
      toolCallCount += message.toolCalls.length;
      toolCallNames.push(...message.toolCalls.map((call) => call.function.name));
    }
  }

  return {
    messageCount: messages.length,
    roleCounts,
    stringContentMessages,
    partContentMessages,
    textPartCount,
    imagePartCount,
    videoPartCount,
    textChars,
    toolCallCount,
    toolCallNames,
  };
}

function countContentChars(content: ChatMessage['content']): number {
  if (typeof content === 'string') {
    return content.length;
  }

  return content.reduce((sum, part) => {
    if (part.type !== 'text') {
      return sum;
    }
    return sum + part.text.length;
  }, 0);
}

function summarizeError(error: unknown): ErrorSummary {
  if (error instanceof Error) {
    const cause = readUnknownObjectField(error, 'cause');
    const code = firstString(readUnknownObjectField(error, 'code'));
    const category = firstString(readUnknownObjectField(error, 'category'));
    const retryable = readUnknownObjectField(error, 'retryable');
    const statusCode = readUnknownObjectField(error, 'statusCode');
    const url = firstString(readUnknownObjectField(error, 'url'));
    return {
      name: error.name,
      message: truncateForLog(error.message),
      ...(code ? { code } : {}),
      ...(category ? { category } : {}),
      ...(typeof retryable === 'boolean' ? { retryable } : {}),
      ...(typeof statusCode === 'number' ? { statusCode } : {}),
      ...(url ? { url } : {}),
      ...(cause instanceof Error ? { cause: summarizeError(cause) } : {}),
    };
  }

  return {
    name: typeof error,
    message: truncateForLog(String(error)),
  };
}

function canRetryInitialModelCall(input: {
  readonly error: PlatformError;
  readonly retryPolicy?: RetryPolicy;
  readonly retries: number;
  readonly signal?: AbortSignal;
}): boolean {
  if (input.signal?.aborted || !input.retryPolicy) {
    return false;
  }
  if (input.retries >= input.retryPolicy.maxRetries || !input.error.retryable) {
    return false;
  }
  return input.retryPolicy.retryableCategories.includes(input.error.category);
}

function getModelCallRetryDelayMs(
  error: PlatformError,
  retryPolicy: RetryPolicy | undefined,
  retries: number,
): number {
  if (error.retryAfter !== undefined) {
    return error.retryAfter;
  }
  if (!retryPolicy) {
    return 0;
  }
  return calculateBackoff(retryPolicy.backoffStrategy, retries);
}

function normalizeModelCallStreamError(error: unknown, routing: RoutingResult): PlatformError {
  if (error instanceof PlatformError) {
    return error;
  }

  if (error instanceof HttpClientError) {
    const statusCode = error.statusCode;
    const category = classifyModelCallHttpError(error);
    return new PlatformError({
      category,
      code: `MODEL_CALL_${error.code.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`,
      message: error.message,
      retryable: isModelCallHttpErrorRetryable(error, category),
      ...(error.retryAfterMs !== undefined ? { retryAfter: error.retryAfterMs } : {}),
      cause: error,
      context: {
        providerId: routing.providerId,
        modelId: routing.modelId,
        url: error.url,
        ...(statusCode !== undefined ? { statusCode } : {}),
      },
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  const category = classifyModelCallMessage(message);
  return new PlatformError({
    category,
    code: `MODEL_CALL_${category.toUpperCase()}`,
    message,
    retryable: isModelCallMessageRetryable(message, category),
    ...(error instanceof Error ? { cause: error } : {}),
    context: {
      providerId: routing.providerId,
      modelId: routing.modelId,
    },
  });
}

function classifyModelCallHttpError(error: HttpClientError): PlatformErrorCategory {
  const statusCode = error.statusCode;
  if (statusCode === 0 || statusCode === undefined) return 'network';
  if (statusCode === 400) return 'validation';
  if (statusCode === 401 || statusCode === 403) return 'authentication';
  if (statusCode === 408) return 'timeout';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode >= 500) return 'server';
  return 'unknown';
}

function isModelCallHttpErrorRetryable(
  error: HttpClientError,
  category: PlatformErrorCategory,
): boolean {
  if (category === 'network' || category === 'timeout' || category === 'server') {
    return error.retryable;
  }
  if (category === 'rate_limit') {
    return true;
  }
  return false;
}

function classifyModelCallMessage(message: string): PlatformErrorCategory {
  const normalized = message.toLowerCase();
  if (normalized.includes('abort') || normalized.includes('cancel')) return 'validation';
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'timeout';
  if (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('econnreset') ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('etimedout')
  ) {
    return 'network';
  }
  return 'unknown';
}

function isModelCallMessageRetryable(message: string, category: PlatformErrorCategory): boolean {
  if (category === 'timeout' || category === 'network') {
    return !message.toLowerCase().includes('abort');
  }
  return false;
}

function createModelCallRetryExhaustedError(
  error: PlatformError,
  routing: RoutingResult,
  attempts: number,
): PlatformError {
  return new PlatformError({
    category: toPlatformErrorCategory(error.category),
    code: `${error.code}_RETRY_EXHAUSTED`,
    message: `Model request failed after ${attempts} attempts for ${routing.providerId}/${routing.modelId}: ${error.message}`,
    retryable: false,
    cause: error,
    context: {
      ...error.context,
      providerId: routing.providerId,
      modelId: routing.modelId,
      attempts,
    },
  });
}

function toPlatformErrorCategory(category: string): PlatformErrorCategory {
  switch (category) {
    case 'authentication':
    case 'rate_limit':
    case 'timeout':
    case 'network':
    case 'server':
    case 'validation':
    case 'not_found':
    case 'context_length':
    case 'content_filter':
    case 'unknown':
      return category;
    default:
      return 'unknown';
  }
}

function readUnknownObjectField(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return truncateForLog(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
  }
  return undefined;
}

function truncateForLog(value: string, maxLength = 500): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function sanitizeMediaUrlForDebugLog(url: string): string {
  if (url.startsWith('data:')) {
    const metadataEnd = url.indexOf(',');
    const metadata = metadataEnd >= 0 ? url.slice(0, metadataEnd) : 'data:';
    return `${metadata},<omitted ${url.length} chars>`;
  }

  return url;
}
