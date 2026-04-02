/**
 * AI SDK Adapter Base Class
 *
 * Uses Vercel AI SDK for unified provider integration.
 * Subclasses only need to implement getLanguageModel().
 */

import {
  generateText,
  streamText,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type {
  Adapter,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ToolDefinition,
  ImageGenerationOptions,
  ImageGenerationResult,
  ModelInfo,
  ApiKeyValidationResult,
} from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';
import { getLogger } from '../../utils/logger';

const logger = getLogger('AISdkAdapter');

/**
 * Abstract base adapter using AI SDK
 */
export abstract class AISdkAdapter implements Adapter {
  abstract readonly type: string;

  /**
   * Get the AI SDK language model instance
   */
  protected abstract getLanguageModel(model: Model, provider: Provider): LanguageModel;

  /**
   * Get list of supported capabilities
   */
  protected abstract getSupportedCapabilities(): string[];

  /**
   * Check if adapter supports streaming
   */
  supportsStreaming(): boolean {
    return true;
  }

  /**
   * Check if adapter supports the given capability
   */
  supportsCapability(capability: string): boolean {
    return this.getSupportedCapabilities().includes(capability);
  }

  /**
   * Send chat request using AI SDK generateText
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): Promise<ChatResponse> {
    const languageModel = this.getLanguageModel(model, provider);
    const { systemPrompt, coreMessages } = this.transformMessages(messages);

    const tools = options.tools ? this.transformTools(options.tools) : undefined;

    // Build request options, only include defined values
    const requestOptions: Parameters<typeof generateText>[0] = {
      model: languageModel,
      system: systemPrompt,
      messages: coreMessages,
      tools,
      abortSignal: options.signal,
      ...this.getProviderOptions(options, provider, model),
    };

    // Reasoning models (o1, o3, deepseek-r1, etc.) don't support sampling params
    const isReasoning = model.capabilities?.includes('reasoning');

    // Only add optional parameters if they are defined
    if (!isReasoning && options.temperature !== undefined)
      requestOptions.temperature = options.temperature;
    if (options.maxTokens !== undefined) requestOptions.maxOutputTokens = options.maxTokens;
    if (!isReasoning && options.topP !== undefined) requestOptions.topP = options.topP;
    if (options.stop !== undefined) requestOptions.stopSequences = options.stop;

    // Debug logging
    logger.debug('generateText request', {
      model: model.name,
      provider: provider.id,
      providerSupportsBeta: provider.supportsBeta,
      hasSystem: !!systemPrompt,
      messageCount: coreMessages.length,
      hasTools: !!tools,
      temperature: requestOptions.temperature,
      maxOutputTokens: requestOptions.maxOutputTokens,
      providerOptions: (requestOptions as Record<string, unknown>).providerOptions,
    });

    try {
      const result = await generateText(requestOptions);
      return this.transformGenerateTextResult(result, model.name);
    } catch (error) {
      // Log detailed AI SDK error info
      logger.error('generateText error', { error });
      if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        logger.error('Error details', {
          name: err.name,
          message: err.message,
          statusCode: err.statusCode,
          url: err.url,
          cause: err.cause,
          responseBody: err.responseBody,
          isRetryable: err.isRetryable,
        });
      }
      throw error;
    }
  }

  /**
   * Send streaming chat request using AI SDK streamText
   */
  async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): AsyncIterable<ChatChunk> {
    const languageModel = this.getLanguageModel(model, provider);
    const { systemPrompt, coreMessages } = this.transformMessages(messages);

    const tools = options.tools ? this.transformTools(options.tools) : undefined;

    try {
      // Reasoning models (o1, o3, deepseek-r1, etc.) don't support sampling params
      const isReasoning = model.capabilities?.includes('reasoning');

      const result = streamText({
        model: languageModel,
        system: systemPrompt,
        messages: coreMessages,
        temperature: isReasoning ? undefined : options.temperature,
        maxOutputTokens: options.maxTokens,
        topP: isReasoning ? undefined : options.topP,
        frequencyPenalty: isReasoning ? undefined : options.frequencyPenalty,
        presencePenalty: isReasoning ? undefined : options.presencePenalty,
        stopSequences: options.stop,
        tools,
        abortSignal: options.signal,
        ...this.getProviderOptions(options, provider, model),
      });

      const chunkId = `chatcmpl-${Date.now()}`;

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield {
            id: chunkId,
            model: model.name,
            delta: {
              content: part.text,
            },
          };
        } else if (part.type === 'tool-call') {
          yield {
            id: chunkId,
            model: model.name,
            delta: {
              toolCalls: [
                {
                  id: part.toolCallId,
                  type: 'function',
                  function: {
                    name: part.toolName,
                    arguments: JSON.stringify(part.input),
                  },
                },
              ],
            },
          };
        } else if (part.type === 'reasoning-delta') {
          // Extended thinking (Claude)
          yield {
            id: chunkId,
            model: model.name,
            delta: {},
            thinking: part.text,
          };
        } else if (part.type === 'error') {
          // AI SDK emits errors as stream parts instead of throwing.
          // Re-throw so the error propagates to the agent error handler.
          throw part.error;
        } else if (part.type === 'finish') {
          yield {
            id: chunkId,
            model: model.name,
            delta: {},
            finishReason: this.mapFinishReason(part.finishReason),
            usage: part.usage
              ? {
                  promptTokens: part.usage.promptTokens ?? 0,
                  completionTokens: part.usage.completionTokens ?? 0,
                  totalTokens: (part.usage.promptTokens ?? 0) + (part.usage.completionTokens ?? 0),
                }
              : undefined,
          };
        }
      }
    } catch (error) {
      // Log detailed AI SDK error info (consistent with chat() method)
      logger.error('streamText error', { error });
      if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        logger.error('Stream error details', {
          name: err.name,
          message: err.message,
          statusCode: err.statusCode,
          url: err.url,
          cause: err.cause,
          responseBody: err.responseBody,
          isRetryable: err.isRetryable,
        });
      }
      throw error;
    }
  }

  /**
   * Generate embeddings (optional, subclasses can override)
   */
  embed?(input: string | string[], model: Model, provider: Provider): Promise<number[][]>;

  /**
   * Generate image (optional, subclasses can override)
   */
  generateImage?(
    prompt: string,
    options: ImageGenerationOptions,
    model: Model,
    provider: Provider,
  ): Promise<ImageGenerationResult>;

  /**
   * List available models (optional, subclasses can override)
   */
  listModels?(provider: Provider): Promise<string[]>;

  /**
   * List available models with details (optional, subclasses can override)
   */
  listModelsDetailed?(provider: Provider): Promise<ModelInfo[]>;

  /**
   * Validate API key by making a test request
   * Uses listModels first to get a valid model, then sends a minimal chat request
   * @param provider Provider configuration
   * @param modelName Optional model name to use for validation (recommended for accurate testing)
   */
  async validateApiKey(provider: Provider, modelName?: string): Promise<ApiKeyValidationResult> {
    try {
      // Use provided model name or try to auto-detect
      let testModelName = modelName || 'gpt-3.5-turbo'; // fallback default

      if (!modelName && this.listModels) {
        try {
          const models = await this.listModels(provider);
          if (models.length > 0) {
            testModelName = models[0]!;
          }
        } catch {
          // If listModels fails, try with default model
        }
      }

      // Create a minimal model config for testing
      const testModel: Model = {
        id: testModelName,
        name: testModelName,
        providerId: provider.id,
        capabilities: ['chat'],
        enabled: true,
      };

      // Send a minimal chat request to validate
      await this.chat([{ role: 'user', content: 'hi' }], { maxTokens: 1 }, testModel, provider);

      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Detect common authentication errors
      if (
        message.includes('401') ||
        message.toLowerCase().includes('invalid api key') ||
        message.toLowerCase().includes('unauthorized')
      ) {
        return { valid: false, error: 'Invalid API key' };
      }
      if (
        message.includes('403') ||
        message.toLowerCase().includes('access denied') ||
        message.toLowerCase().includes('forbidden')
      ) {
        return { valid: false, error: 'Access denied' };
      }
      if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        return { valid: false, error: 'Rate limit exceeded' };
      }

      return { valid: false, error: message };
    }
  }

  // ===========================================================================
  // Protected Methods for Subclasses
  // ===========================================================================

  /**
   * Get provider-specific options (override in subclasses)
   * @param _options Chat options
   * @param _provider Provider configuration
   * @param _model Model configuration (for model-level overrides)
   */
  protected getProviderOptions(
    _options: ChatOptions,
    _provider: Provider,
    _model: Model,
  ): Record<string, unknown> {
    return {};
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Transform our ChatMessage[] to AI SDK ModelMessage[]
   */
  private transformMessages(messages: ChatMessage[]): {
    systemPrompt: string | undefined;
    coreMessages: ModelMessage[];
  } {
    let systemPrompt: string | undefined;
    const coreMessages: ModelMessage[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        systemPrompt = typeof message.content === 'string' ? message.content : '';
        continue;
      }

      if (message.role === 'tool') {
        // Convert content to ToolResultOutput format
        // Tool results are typically strings or can be serialized to JSON
        const toolOutput =
          typeof message.content === 'string'
            ? { type: 'text' as const, value: message.content }
            : { type: 'text' as const, value: JSON.stringify(message.content) };

        coreMessages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: message.toolCallId || '',
              toolName: message.name || '',
              output: toolOutput,
            },
          ],
        });
        continue;
      }

      if (message.role === 'assistant') {
        if (message.toolCalls && message.toolCalls.length > 0) {
          coreMessages.push({
            role: 'assistant',
            content: [
              ...(typeof message.content === 'string' && message.content
                ? [{ type: 'text' as const, text: message.content }]
                : []),
              ...message.toolCalls.map((tc) => {
                let input: unknown;
                try {
                  input = JSON.parse(tc.function.arguments || '{}');
                } catch {
                  input = { _raw: tc.function.arguments };
                }
                return {
                  type: 'tool-call' as const,
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  input,
                };
              }),
            ],
          });
        } else {
          coreMessages.push({
            role: 'assistant',
            content: typeof message.content === 'string' ? message.content : '',
          });
        }
        continue;
      }

      // User message
      if (typeof message.content === 'string') {
        coreMessages.push({
          role: 'user',
          content: message.content,
        });
      } else {
        // Multimodal content
        coreMessages.push({
          role: 'user',
          content: message.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text' as const, text: part.text };
            } else if (part.type === 'video') {
              // Pass video as file content for models with native video understanding
              // For models without native video support, VideoFrameEvaluator
              // decomposes videos into frame images before sending
              return {
                type: 'file' as const,
                data: part.videoUrl,
                mediaType: part.mimeType ?? 'video/mp4',
              };
            } else {
              return {
                type: 'image' as const,
                image: part.imageUrl,
              };
            }
          }),
        });
      }
    }

    return { systemPrompt, coreMessages };
  }

  /**
   * Transform our ToolDefinition[] to AI SDK ToolSet format
   */
  private transformTools(tools: ToolDefinition[]): ToolSet {
    const result: ToolSet = {};

    for (const toolDef of tools) {
      result[toolDef.function.name] = {
        description: toolDef.function.description,
        // Use jsonSchema helper to convert JSON Schema to AI SDK format
        inputSchema: jsonSchema(toolDef.function.parameters as Record<string, unknown>),
      };
    }

    return result;
  }

  /**
   * Transform AI SDK generateText result to our ChatResponse
   */
  private transformGenerateTextResult(
    result: Awaited<ReturnType<typeof generateText>>,
    modelName: string,
  ): ChatResponse {
    const toolCalls = result.toolCalls?.map((tc) => ({
      id: tc.toolCallId,
      type: 'function' as const,
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.input),
      },
    }));

    // Extract thinking text from reasoning array if present
    const thinkingText = result.reasoning?.map((r) => r.text).join('');

    return {
      id: `chatcmpl-${Date.now()}`,
      model: modelName,
      message: {
        role: 'assistant',
        content: result.text || '',
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      },
      finishReason: this.mapFinishReason(result.finishReason),
      usage: {
        promptTokens: result.usage?.inputTokens || 0,
        completionTokens: result.usage?.outputTokens || 0,
        totalTokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
      },
      thinking: thinkingText || undefined,
    };
  }

  /**
   * Map AI SDK finish reason to our format
   */
  private mapFinishReason(reason: string | undefined): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool-calls':
        return 'tool_calls';
      case 'content-filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
