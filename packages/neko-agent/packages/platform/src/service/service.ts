/**
 * AI Service - Unified interface for AI operations
 */

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../types/adapter';
import type {
  ServiceOptions,
  ServiceResponse,
  ServiceStreamResponse,
  ChatWithToolsOptions,
  EmbeddingOptions,
  EmbeddingResponse,
} from '../types/service';
import type { ToolResult } from '../types/tool';
import type { RetryPolicy, TimeoutPolicy } from '../types/error';
import type { IMediaGenerationService, IService } from '../types/interfaces';
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from '../provider/provider-registry';
import { ModelSelector } from './model-selector';
import { PlatformError } from '../provider/platform-error';
import { executeWithRetry, withStreamTimeout } from '../provider/retry-executor';
import { createStreamCollector } from '../llm/adapter/stream-aggregator';

/**
 * AI Service configuration
 */
export interface ServiceConfig {
  configManager: ConfigManager;
  providerRegistry: ProviderRegistry;
  defaultRetryPolicy?: RetryPolicy;
  defaultTimeoutPolicy?: TimeoutPolicy;
  /** Optional media generation service for async image/video/audio generation */
  mediaGenerationService?: IMediaGenerationService;
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
    modelId?: string,
    excludeModels: string[] = [],
    taskType: 'chat' | 'embedding' = 'chat'
  ): RoutingResult {
    return this.selector.resolve(taskType, { modelId, excludeModels });
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

    // getAdapter uses providerRegistry (has actual adapter lookup logic)
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
    startTime: number
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
    options: ServiceOptions = {}
  ): Promise<ServiceResponse> {
    const startTime = Date.now();
    const sessionId = options.sessionId;
    const excludeModels: string[] = [];

    while (true) {
      const routing = this.resolveRouting(options.modelId, excludeModels, 'chat');

      try {
        const { model, provider, adapter } = this.resolveResources(routing);
        const providerId = routing.providerId;

        // Check if provider is available (circuit breaker + health, session-scoped)
        if (!this.config.providerRegistry.isProviderAvailable(providerId, sessionId)) {
          throw new PlatformError({
            category: 'server',
            code: 'PROVIDER_UNAVAILABLE',
            message: `Provider ${providerId} is currently unavailable`,
            retryable: true,
          });
        }

        const retryPolicy = this.config.defaultRetryPolicy || this.getDefaultRetryPolicy();
        const timeoutPolicy = this.config.defaultTimeoutPolicy || this.getDefaultTimeoutPolicy();

        // Execute with rate limiting and circuit breaker protection (session-scoped)
        const response = await this.config.providerRegistry.executeWithProtection(
          providerId,
          () => executeWithRetry(
            async () => {
              const chatOptions: ChatOptions = { ...options, model: model.name };
              return adapter.chat(messages, chatOptions, model, provider);
            },
            { retryPolicy, timeoutPolicy }
          ),
          sessionId
        );

        return { ...response, ...this.buildResponseMeta(routing, startTime) };
      } catch (error) {
        const platformError = PlatformError.fromError(error as Error);

        // Record failure for circuit breaker (if not a rate limit error, session-scoped)
        if (platformError.category !== 'rate_limit') {
          this.config.providerRegistry.recordFailure(
            routing.providerId,
            error as Error,
            sessionId
          );
        }

        excludeModels.push(routing.modelId);

        if (!this.selector.shouldFallback(platformError)) {
          throw platformError;
        }

        // Try resolving next model; if none available this will throw
        try {
          this.selector.resolve('chat', { excludeModels });
        } catch {
          throw platformError;
        }
        // Continue loop with next model
      }
    }
  }

  /**
   * Send a streaming chat request
   */
  chatStream(
    messages: ChatMessage[],
    options: ServiceOptions = {}
  ): ServiceStreamResponse {
    const startTime = Date.now();
    const sessionId = options.sessionId;
    const excludeModels: string[] = [];

    // Pre-flight fallback loop: find an available provider before starting stream
    let routing;
    let model;
    let provider;
    let adapter;
    let providerId: string;

    while (true) {
      routing = this.resolveRouting(options.modelId, excludeModels, 'chat');
      const resources = this.resolveResources(routing);
      model = resources.model;
      provider = resources.provider;
      adapter = resources.adapter;
      providerId = routing.providerId;

      // Check if provider is available (circuit breaker + health, session-scoped)
      if (!this.config.providerRegistry.isProviderAvailable(providerId, sessionId)) {
        excludeModels.push(routing.modelId);
        if (!this.selector.shouldFallback(new PlatformError({ category: 'server', code: 'PROVIDER_UNAVAILABLE', message: '', retryable: true }))) {
          throw new PlatformError({
            category: 'server',
            code: 'PROVIDER_UNAVAILABLE',
            message: `Provider ${providerId} is currently unavailable`,
            retryable: true,
          });
        }
        try { this.selector.resolve('chat', { excludeModels }); } catch {
          throw new PlatformError({
            category: 'server',
            code: 'PROVIDER_UNAVAILABLE',
            message: `Provider ${providerId} is currently unavailable`,
            retryable: true,
          });
        }
        continue;
      }

      // Try to acquire rate limit synchronously
      const rateLimitResult = this.config.providerRegistry.tryAcquireRateLimit(providerId);
      if (!rateLimitResult.allowed) {
        excludeModels.push(routing.modelId);
        try { this.selector.resolve('chat', { excludeModels }); } catch {
          throw new PlatformError({
            category: 'rate_limit',
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for provider ${providerId}`,
            retryable: true,
            retryAfter: rateLimitResult.retryAfterMs,
          });
        }
        continue;
      }

      break; // Found an available provider
    }

    const chatOptions: ChatOptions = { ...options, model: model.name, stream: true };
    const rawStream = adapter.chatStream(messages, chatOptions, model, provider);

    const timeoutPolicy = this.config.defaultTimeoutPolicy || this.getDefaultTimeoutPolicy();
    const stream = timeoutPolicy.streamTimeout
      ? withStreamTimeout(rawStream, timeoutPolicy.streamTimeout)
      : rawStream;

    const { stream: collectedStream, response: responsePromise } = createStreamCollector(stream);

    return {
      stream: collectedStream,
      response: responsePromise
        .then((response) => {
          // Record success for circuit breaker (session-scoped)
          this.config.providerRegistry.recordSuccess(providerId, sessionId);
          return {
            ...response,
            ...this.buildResponseMeta(routing, startTime),
          };
        })
        .catch((error) => {
          // Record failure for circuit breaker (session-scoped)
          this.config.providerRegistry.recordFailure(providerId, error, sessionId);
          throw error;
        }),
    };
  }

  /**
   * Chat with tool calling support
   */
  async chatWithTools(
    messages: ChatMessage[],
    options: ChatWithToolsOptions
  ): Promise<ServiceResponse> {
    const maxIterations = options.maxIterations || 10;
    let currentMessages = [...messages];
    let iterations = 0;
    let lastResponse: ServiceResponse | null = null;

    while (iterations < maxIterations) {
      iterations++;

      const response = await this.chat(currentMessages, options);
      lastResponse = response;

      // Check for tool calls
      if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
        return response;
      }

      // Execute tool calls
      currentMessages.push(response.message);

      for (const toolCall of response.message.toolCalls) {
        if (!options.onToolCall) {
          throw new PlatformError({
            category: 'validation',
            code: 'NO_TOOL_HANDLER',
            message: 'Tool call received but no handler provided',
            retryable: false,
          });
        }

        const result = await options.onToolCall({
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        });

        currentMessages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify(result.data || result.error),
        });
      }
    }

    return lastResponse || await this.chat(currentMessages, options);
  }

  /**
   * Generate embeddings
   */
  async embed(
    input: string | string[],
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResponse> {
    const routing = this.resolveRouting(options.modelId, [], 'embedding');
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

  private getDefaultRetryPolicy(): RetryPolicy {
    const preset = this.config.configManager.getRetryTimeoutPreset('modelCall');
    return preset?.retry || {
      maxRetries: 3,
      backoffStrategy: {
        type: 'exponential',
        initialDelayMs: 1000,
        multiplier: 2,
        maxDelayMs: 30000,
      },
      retryableCategories: ['rate_limit', 'timeout', 'network', 'server'],
    };
  }

  private getDefaultTimeoutPolicy(): TimeoutPolicy {
    const preset = this.config.configManager.getRetryTimeoutPreset('modelCall');
    return preset?.timeout || {
      requestTimeout: 60000,
      totalTimeout: 180000,
      streamTimeout: 30000,
    };
  }

  // ==========================================================================
  // Media Generation Service Integration (Async APIs)
  // ==========================================================================

  /**
   * Check if MediaGenerationService is available
   */
  hasMediaGenerationService(): boolean {
    return !!this.config.mediaGenerationService;
  }

  /**
   * Get MediaGenerationService instance
   * @throws Error if not configured
   */
  getMediaGenerationService(): IMediaGenerationService {
    if (!this.config.mediaGenerationService) {
      throw new PlatformError({
        category: 'validation',
        code: 'MEDIA_SERVICE_NOT_CONFIGURED',
        message: 'MediaGenerationService is not configured',
        retryable: false,
      });
    }
    return this.config.mediaGenerationService;
  }

  // ==========================================================================
  // Provider Model Discovery
  // ==========================================================================

  /**
   * List available models from a provider's API
   * This queries the provider's API directly to get the list of available models.
   *
   * @param providerId The provider ID to query
   * @returns List of model IDs available from the provider
   * @throws PlatformError if provider not found or doesn't support model listing
   */
  async listProviderModels(providerId: string): Promise<string[]> {
    const models = await this.listProviderModelsDetailed(providerId);
    return models.map((m) => m.id);
  }

  /**
   * List available models with detailed capability information
   *
   * @param providerId The provider ID to query
   * @returns List of models with their capabilities
   * @throws PlatformError if provider not found or doesn't support model listing
   */
  async listProviderModelsDetailed(
    providerId: string
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

    // getAdapter uses providerRegistry (has actual adapter lookup logic)
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
   * Makes a test request to check if the key is valid
   * @param providerId Provider ID to validate
   * @param modelId Optional model ID - when specified, uses this model for validation test
   */
  async validateProviderApiKey(
    providerId: string,
    modelId?: string
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
        // If modelId not found in config, use it directly as model name
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
}
