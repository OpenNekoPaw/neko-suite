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
  EmbeddingOptions,
  EmbeddingResponse,
} from '../types/service';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import type { IService } from '../types/interfaces';
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from '../provider/provider-registry';
import { ModelSelector } from './model-selector';
import { PlatformError } from '../provider/platform-error';
import { createStreamCollector } from '../llm/adapter/stream-aggregator';
import { getLogger } from '../utils/logger';

/**
 * AI Service configuration
 */
export interface ServiceConfig {
  configManager: ConfigManager;
  providerRegistry: ProviderRegistry;
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

    const chatOptions: ChatOptions = { ...options, model: model.name };
    try {
      const projectedMessages = await projectMessagesForProvider(messages, chatOptions, {
        providerId: routing.providerId,
        modelId: routing.modelId,
      });
      logger.debug(
        'neko.agent.llm.request',
        withAgentTrace(
          trace,
          createModelCallRequestLog({
            requestId,
            stream: false,
            routing,
            options: chatOptions,
            originalMessages: messages,
            projectedMessages,
          }),
        ),
      );
      logger.debug(
        'neko.agent.llm.request.raw',
        withAgentTrace(
          trace,
          createModelCallRequestDebugLog({
            requestId,
            stream: false,
            routing,
            options: chatOptions,
            originalMessages: messages,
            projectedMessages,
          }),
        ),
      );

      const response = await adapter.chat(projectedMessages, chatOptions, model, provider);
      const responseMeta = this.buildResponseMeta(routing, startTime);
      logger.debug(
        'neko.agent.llm.response',
        withAgentTrace(
          trace,
          createModelCallResponseLog({
            requestId,
            stream: false,
            routing,
            durationMs: responseMeta.timing.duration,
            response,
          }),
        ),
      );
      logger.debug(
        'neko.agent.llm.response.raw',
        withAgentTrace(
          trace,
          createModelCallResponseDebugLog({
            requestId,
            stream: false,
            routing,
            response,
          }),
        ),
      );
      return { ...response, ...responseMeta };
    } catch (error) {
      logger.warn(
        'neko.agent.llm.failed',
        withAgentTrace(
          trace,
          createModelCallFailureLog({
            requestId,
            stream: false,
            routing,
            durationMs: Date.now() - startTime,
            error,
          }),
        ),
      );
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

    const chatOptions: ChatOptions = { ...options, model: model.name, stream: true };
    const rawStream = createProjectedChatStream({
      messages,
      options: chatOptions,
      providerId: routing.providerId,
      modelId: routing.modelId,
      onProjected: (projectedMessages) => {
        logger.debug(
          'neko.agent.llm.request',
          withAgentTrace(
            trace,
            createModelCallRequestLog({
              requestId,
              stream: true,
              routing,
              options: chatOptions,
              originalMessages: messages,
              projectedMessages,
            }),
          ),
        );
        logger.debug(
          'neko.agent.llm.request.raw',
          withAgentTrace(
            trace,
            createModelCallRequestDebugLog({
              requestId,
              stream: true,
              routing,
              options: chatOptions,
              originalMessages: messages,
              projectedMessages,
            }),
          ),
        );
      },
      start: (projectedMessages) =>
        adapter.chatStream(projectedMessages, chatOptions, model, provider),
    });

    // Apply stream timeout if configured
    const timeoutMs = this.getStreamTimeout();
    const stream = timeoutMs ? this.withStreamTimeout(rawStream, timeoutMs) : rawStream;

    const { stream: collectedStream, response: responsePromise } = createStreamCollector(stream);

    return {
      stream: collectedStream,
      response: responsePromise
        .then((response) => {
          const responseMeta = this.buildResponseMeta(routing, startTime);
          logger.debug(
            'neko.agent.llm.response',
            withAgentTrace(
              trace,
              createModelCallResponseLog({
                requestId,
                stream: true,
                routing,
                durationMs: responseMeta.timing.duration,
                response,
              }),
            ),
          );
          logger.debug(
            'neko.agent.llm.response.raw',
            withAgentTrace(
              trace,
              createModelCallResponseDebugLog({
                requestId,
                stream: true,
                routing,
                response,
              }),
            ),
          );
          return {
            ...response,
            ...responseMeta,
          };
        })
        .catch((error: unknown) => {
          logger.warn(
            'neko.agent.llm.failed',
            withAgentTrace(
              trace,
              createModelCallFailureLog({
                requestId,
                stream: true,
                routing,
                durationMs: Date.now() - startTime,
                error,
              }),
            ),
          );
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
  readonly systemPromptSectionCount: number;
  readonly cachedSystemPromptSectionCount: number;
  readonly hasAbortSignal: boolean;
  readonly hasMessageProjector: boolean;
}

interface ErrorSummary {
  readonly name: string;
  readonly message: string;
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
    return {
      name: error.name,
      message: truncateForLog(error.message),
    };
  }

  return {
    name: typeof error,
    message: truncateForLog(String(error)),
  };
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
