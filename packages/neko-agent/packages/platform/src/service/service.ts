/**
 * AI Service - Unified interface for AI operations
 *
 * Simplified to direct adapter calls. Vercel AI SDK handles retries internally.
 * Circuit breaker, rate limiting, and multi-model fallback have been removed
 * as they are unnecessary for a single-user desktop application.
 */

import type { ChatChunk, ChatMessage, ChatOptions } from '../types/adapter';
import type {
  ServiceOptions,
  ServiceResponse,
  ServiceStreamResponse,
  EmbeddingOptions,
  EmbeddingResponse,
} from '../types/service';
import type { IService } from '../types/interfaces';
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from '../provider/provider-registry';
import { ModelSelector } from './model-selector';
import { PlatformError } from '../provider/platform-error';
import { createStreamCollector } from '../llm/adapter/stream-aggregator';

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
    modelId?: string,
    excludeModels: string[] = [],
    taskType: 'chat' | 'embedding' = 'chat',
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
  async chat(messages: ChatMessage[], options: ServiceOptions = {}): Promise<ServiceResponse> {
    const startTime = Date.now();
    const routing = this.resolveRouting(options.modelId, [], 'chat');
    const { model, provider, adapter } = this.resolveResources(routing);

    const chatOptions: ChatOptions = { ...options, model: model.name };
    const projectedMessages = await projectMessagesForProvider(messages, chatOptions, {
      providerId: routing.providerId,
      modelId: routing.modelId,
    });
    const response = await adapter.chat(projectedMessages, chatOptions, model, provider);
    return { ...response, ...this.buildResponseMeta(routing, startTime) };
  }

  /**
   * Send a streaming chat request
   */
  chatStream(messages: ChatMessage[], options: ServiceOptions = {}): ServiceStreamResponse {
    const startTime = Date.now();
    const routing = this.resolveRouting(options.modelId, [], 'chat');
    const { model, provider, adapter } = this.resolveResources(routing);

    const chatOptions: ChatOptions = { ...options, model: model.name, stream: true };
    const rawStream = createProjectedChatStream({
      messages,
      options: chatOptions,
      providerId: routing.providerId,
      modelId: routing.modelId,
      start: (projectedMessages) =>
        adapter.chatStream(projectedMessages, chatOptions, model, provider),
    });

    // Apply stream timeout if configured
    const timeoutMs = this.getStreamTimeout();
    const stream = timeoutMs ? this.withStreamTimeout(rawStream, timeoutMs) : rawStream;

    const { stream: collectedStream, response: responsePromise } = createStreamCollector(stream);

    return {
      stream: collectedStream,
      response: responsePromise.then((response) => ({
        ...response,
        ...this.buildResponseMeta(routing, startTime),
      })),
    };
  }

  /**
   * Generate embeddings
   */
  async embed(
    input: string | string[],
    options: EmbeddingOptions = {},
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
  readonly start: (messages: ChatMessage[]) => AsyncIterable<ChatChunk>;
}): AsyncIterable<ChatChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const projectedMessages = await projectMessagesForProvider(input.messages, input.options, {
        providerId: input.providerId,
        modelId: input.modelId,
      });
      yield* input.start(projectedMessages);
    },
  };
}
