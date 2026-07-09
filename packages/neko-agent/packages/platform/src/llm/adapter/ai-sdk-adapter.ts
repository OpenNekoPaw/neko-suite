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
  APICallError,
  RetryError,
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
import type { PlatformErrorCategory } from '../../types/error';
import { getLogger } from '../../utils/logger';
import { PlatformError } from '../../provider/platform-error';
import { sleepWithAbort } from '@neko/shared';

const MODEL_CALL_TOTAL_ATTEMPTS = 5;
const MODEL_CALL_MAX_RETRIES = MODEL_CALL_TOTAL_ATTEMPTS - 1;
const MODEL_CALL_INITIAL_RETRY_DELAY_MS = 2000;
const MODEL_CALL_RETRY_BACKOFF_FACTOR = 2;
const MODEL_CALL_MAX_RETRY_DELAY_MS = 30000;
const ERROR_LOG_FIELD_MAX_LENGTH = 2000;
const ERROR_LOG_CAUSE_MAX_DEPTH = 2;

interface AISdkErrorSummary {
  readonly name?: string;
  readonly message: string;
  readonly statusCode?: number;
  readonly code?: string;
  readonly url?: string;
  readonly responseBody?: string;
  readonly responseBodyLength?: number;
  readonly isRetryable?: boolean;
  readonly cause?: AISdkErrorSummary;
}

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
      maxRetries: 0,
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
    getAdapterLogger().debug('generateText request', {
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
      const result = await runAISdkModelCallWithRetries(
        () => generateText(requestOptions),
        provider,
        model,
        options.signal,
      );
      return this.transformGenerateTextResult(result, model.name);
    } catch (error) {
      const normalized = normalizeAISdkModelCallError(error, provider, model);
      getAdapterLogger().error('generateText error', { error: summarizeAISdkError(normalized) });
      throw normalized;
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

    const requestOptions: Parameters<typeof streamText>[0] = {
      model: languageModel,
      system: systemPrompt,
      messages: coreMessages,
      temperature: undefined,
      maxOutputTokens: options.maxTokens,
      topP: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
      stopSequences: options.stop,
      tools,
      abortSignal: options.signal,
      maxRetries: 0,
      ...this.getProviderOptions(options, provider, model),
    };

    try {
      // Reasoning models (o1, o3, deepseek-r1, etc.) don't support sampling params
      const isReasoning = model.capabilities?.includes('reasoning');
      if (!isReasoning) {
        requestOptions.temperature = options.temperature;
        requestOptions.topP = options.topP;
        requestOptions.frequencyPenalty = options.frequencyPenalty;
        requestOptions.presencePenalty = options.presencePenalty;
      }

      let retryCount = 0;
      while (true) {
        let emittedChunk = false;
        try {
          const result = streamText(requestOptions);

          const chunkId = `chatcmpl-${Date.now()}`;

          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              emittedChunk = true;
              yield {
                id: chunkId,
                model: model.name,
                delta: {
                  content: part.text,
                },
              };
            } else if (part.type === 'tool-call') {
              emittedChunk = true;
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
              emittedChunk = true;
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
              const usage = part.totalUsage;
              emittedChunk = true;
              yield {
                id: chunkId,
                model: model.name,
                delta: {},
                finishReason: this.mapFinishReason(part.finishReason),
                usage: usage
                  ? {
                      promptTokens: usage.inputTokens ?? 0,
                      completionTokens: usage.outputTokens ?? 0,
                      totalTokens:
                        usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                    }
                  : undefined,
              };
            }
          }
          return;
        } catch (error) {
          const normalized = normalizeAISdkModelCallError(error, provider, model);
          if (emittedChunk || !canRetryAISdkModelCall(normalized, retryCount, options.signal)) {
            throw normalized;
          }
          await waitBeforeAISdkModelCallRetry(normalized, retryCount, options.signal);
          retryCount += 1;
        }
      }
    } catch (error) {
      const normalized = normalizeAISdkModelCallError(error, provider, model);
      getAdapterLogger().error('streamText error', { error: summarizeAISdkError(normalized) });
      throw normalized;
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
          const firstModel = models[0];
          if (firstModel) {
            testModelName = firstModel;
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
    options: ChatOptions,
    _provider: Provider,
    _model: Model,
  ): Record<string, unknown> {
    return options.providerOptions ? { providerOptions: options.providerOptions } : {};
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
            } else if (part.type === 'audio') {
              return {
                type: 'file' as const,
                data: part.audioUrl,
                mediaType: part.mimeType ?? 'audio/wav',
              };
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
              return toAISdkImagePart(part.imageUrl, part.detail);
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
        reasoningContent: thinkingText || undefined,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      },
      finishReason: this.mapFinishReason(result.finishReason),
      usage: {
        promptTokens: result.usage?.inputTokens || 0,
        completionTokens: result.usage?.outputTokens || 0,
        totalTokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
      },
      thinking: thinkingText || undefined,
      reasoningContent: thinkingText || undefined,
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

function toAISdkImagePart(
  imageUrl: string,
  detail: 'auto' | 'low' | 'high' | undefined,
): {
  type: 'image';
  image: string | Uint8Array | URL;
  mediaType?: string;
  providerOptions?: { openai: { imageDetail: 'auto' | 'low' | 'high' } };
} {
  const dataUrl = parseImageDataUrl(imageUrl);
  const image = dataUrl ? dataUrl.base64Content : toUrlIfPossible(imageUrl);
  return {
    type: 'image',
    image,
    ...(dataUrl ? { mediaType: dataUrl.mediaType } : {}),
    ...(detail ? { providerOptions: { openai: { imageDetail: detail } } } : {}),
  };
}

function parseImageDataUrl(
  value: string,
): { mediaType: string; base64Content: string } | undefined {
  if (!value.startsWith('data:')) {
    return undefined;
  }

  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) {
    return undefined;
  }

  const header = value.slice(0, commaIndex);
  const base64Content = value.slice(commaIndex + 1);
  if (!header.endsWith(';base64') || base64Content.length === 0) {
    return undefined;
  }

  const mediaType = header.slice('data:'.length, -';base64'.length);
  if (!mediaType.startsWith('image/')) {
    return undefined;
  }

  return { mediaType, base64Content };
}

function toUrlIfPossible(value: string): string | URL {
  try {
    return new URL(value);
  } catch {
    return value;
  }
}

function getAdapterLogger() {
  return getLogger('AISdkAdapter');
}

async function runAISdkModelCallWithRetries<T>(
  call: () => Promise<T>,
  provider: Provider,
  model: Model,
  signal?: AbortSignal,
): Promise<T> {
  let retryCount = 0;
  while (true) {
    try {
      return await call();
    } catch (error) {
      const normalized = normalizeAISdkModelCallError(error, provider, model);
      if (!canRetryAISdkModelCall(normalized, retryCount, signal)) {
        throw normalized;
      }
      await waitBeforeAISdkModelCallRetry(normalized, retryCount, signal);
      retryCount += 1;
    }
  }
}

function canRetryAISdkModelCall(error: Error, retryCount: number, signal?: AbortSignal): boolean {
  if (signal?.aborted || retryCount >= MODEL_CALL_MAX_RETRIES) {
    return false;
  }
  return error instanceof PlatformError && error.retryable;
}

async function waitBeforeAISdkModelCallRetry(
  error: Error,
  retryCount: number,
  signal?: AbortSignal,
): Promise<void> {
  const retryAfter =
    error instanceof PlatformError && error.retryAfter !== undefined ? error.retryAfter : undefined;
  const delayMs =
    retryAfter ??
    Math.min(
      MODEL_CALL_INITIAL_RETRY_DELAY_MS * Math.pow(MODEL_CALL_RETRY_BACKOFF_FACTOR, retryCount),
      MODEL_CALL_MAX_RETRY_DELAY_MS,
    );
  await sleepWithAbort(delayMs, signal);
}

function normalizeAISdkModelCallError(error: unknown, provider: Provider, model: Model): Error {
  const apiError = extractAISdkApiCallError(error);
  if (!apiError) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const category = classifyAISdkApiError(apiError);
  const retryAfter = readRetryAfterMs(apiError);
  return new PlatformError({
    category,
    code: buildAISdkPlatformErrorCode(apiError, category),
    message: apiError.message,
    retryable: isAISdkPlatformErrorRetryable(apiError, category),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    cause: apiError,
    context: {
      providerId: provider.id,
      modelId: model.id,
      modelName: model.name,
      ...(apiError.url ? { url: apiError.url } : {}),
      ...(apiError.statusCode !== undefined ? { statusCode: apiError.statusCode } : {}),
    },
  });
}

function extractAISdkApiCallError(error: unknown): APICallError | undefined {
  if (APICallError.isInstance(error)) {
    return error;
  }
  if (RetryError.isInstance(error)) {
    for (let index = error.errors.length - 1; index >= 0; index -= 1) {
      const candidate = error.errors[index];
      if (APICallError.isInstance(candidate)) {
        return candidate;
      }
    }
  }

  const lastError = readObjectField(error, 'lastError');
  if (APICallError.isInstance(lastError)) {
    return lastError;
  }

  return undefined;
}

function classifyAISdkApiError(error: APICallError): PlatformErrorCategory {
  const statusCode = error.statusCode;
  if (statusCode === 400) {
    return classifyBadRequestMessage(error.message);
  }
  if (statusCode === 401 || statusCode === 403) return 'authentication';
  if (statusCode === 408) return 'timeout';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 429) {
    return isQuotaOrBillingApiError(error) ? 'validation' : 'rate_limit';
  }
  if (statusCode !== undefined && statusCode >= 500) return 'server';
  return error.isRetryable ? 'network' : 'unknown';
}

function classifyBadRequestMessage(message: string): PlatformErrorCategory {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('context length') ||
    normalized.includes('maximum context') ||
    normalized.includes('too many tokens')
  ) {
    return 'context_length';
  }
  if (normalized.includes('content filter') || normalized.includes('safety')) {
    return 'content_filter';
  }
  return 'validation';
}

function isAISdkPlatformErrorRetryable(
  error: APICallError,
  category: PlatformErrorCategory,
): boolean {
  if (category === 'rate_limit') return true;
  if (category === 'timeout' || category === 'network' || category === 'server') {
    return error.isRetryable === true;
  }
  return false;
}

function buildAISdkPlatformErrorCode(error: APICallError, category: PlatformErrorCategory): string {
  const providerCode =
    firstString(
      readObjectField(error.data, 'code'),
      readObjectField(error.data, 'type'),
      readObjectField(error.data, 'errorCode'),
      readObjectField(readObjectField(error.data, 'error'), 'code'),
      readObjectField(readObjectField(error.data, 'error'), 'type'),
    ) ?? category.toUpperCase();
  return `AI_SDK_${providerCode.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`;
}

function readRetryAfterMs(error: APICallError): number | undefined {
  const headers = error.responseHeaders;
  if (!headers) return undefined;

  const retryAfterMs = headers['retry-after-ms'];
  if (retryAfterMs) {
    const value = Number.parseFloat(retryAfterMs);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  const retryAfter = headers['retry-after'];
  if (!retryAfter) return undefined;

  const seconds = Number.parseFloat(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

function isQuotaOrBillingApiError(error: APICallError): boolean {
  const normalized = [
    error.message,
    firstString(
      readObjectField(error.data, 'code'),
      readObjectField(error.data, 'type'),
      readObjectField(error.data, 'errorCode'),
      readObjectField(readObjectField(error.data, 'error'), 'message'),
      readObjectField(readObjectField(error.data, 'error'), 'code'),
      readObjectField(readObjectField(error.data, 'error'), 'type'),
    ),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
  return (
    normalized.includes('quota') ||
    normalized.includes('billing') ||
    normalized.includes('insufficient_quota') ||
    normalized.includes('insufficient credits') ||
    normalized.includes('balance') ||
    normalized.includes('credit')
  );
}

function summarizeAISdkError(error: unknown, depth = 0): AISdkErrorSummary {
  const message = getErrorMessage(error);
  if (!isObjectLike(error)) {
    return {
      name: typeof error,
      message,
    };
  }

  const response = readObjectField(error, 'response');
  const responseBody = firstLogString(
    readObjectField(error, 'responseBody'),
    readObjectField(response, 'body'),
    readObjectField(error, 'body'),
    readObjectField(error, 'data'),
  );
  const cause = readObjectField(error, 'cause');
  const causeSummary =
    depth < ERROR_LOG_CAUSE_MAX_DEPTH && cause !== undefined && cause !== null
      ? summarizeAISdkError(cause, depth + 1)
      : undefined;
  const name = firstString(readObjectField(error, 'name'));
  const statusCode = firstStatusCode(
    readObjectField(error, 'statusCode'),
    readObjectField(error, 'status'),
    readObjectField(error, 'responseStatus'),
    readObjectField(response, 'status'),
  );
  const code = firstString(
    readObjectField(error, 'code'),
    readObjectField(error, 'errorCode'),
    readObjectField(error, 'type'),
  );
  const url = firstString(
    readObjectField(error, 'url'),
    readObjectField(error, 'requestUrl'),
    readObjectField(response, 'url'),
  );
  const isRetryable = firstBoolean(readObjectField(error, 'isRetryable'));

  return {
    ...(name !== undefined ? { name } : {}),
    message,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(responseBody
      ? { responseBody: responseBody.value, responseBodyLength: responseBody.length }
      : {}),
    ...(isRetryable !== undefined ? { isRetryable } : {}),
    ...(causeSummary ? { cause: causeSummary } : {}),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return truncateLogField(error.message);
  }

  const message = firstString(readObjectField(error, 'message'));
  if (message) {
    return message;
  }

  const serialized = stringifyForLog(error);
  if (serialized) {
    return serialized.value;
  }

  return 'Unknown AI SDK error';
}

function readObjectField(value: unknown, key: string): unknown {
  if (!isObjectLike(value)) {
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
      return truncateLogField(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
  }
  return undefined;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function firstStatusCode(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d{3}$/.test(value)) {
      return Number.parseInt(value, 10);
    }
  }
  return undefined;
}

function firstLogString(
  ...values: unknown[]
): { readonly value: string; readonly length: number } | undefined {
  for (const value of values) {
    const serialized = stringifyForLog(value);
    if (serialized) {
      return serialized;
    }
  }
  return undefined;
}

function stringifyForLog(
  value: unknown,
): { readonly value: string; readonly length: number } | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return {
      value: truncateLogField(value),
      length: value.length,
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    const stringValue = String(value);
    return {
      value: stringValue,
      length: stringValue.length,
    };
  }

  try {
    const serialized = JSON.stringify(value, createLogReplacer());
    if (serialized === undefined) {
      return undefined;
    }
    return {
      value: truncateLogField(serialized),
      length: serialized.length,
    };
  } catch {
    try {
      const stringValue = String(value);
      return {
        value: truncateLogField(stringValue),
        length: stringValue.length,
      };
    } catch {
      return undefined;
    }
  }
}

function createLogReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: truncateLogField(value.message),
      };
    }

    if (typeof value === 'string') {
      return truncateLogField(value);
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`;
    }

    if (isObjectLike(value)) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  };
}

function truncateLogField(value: string): string {
  if (value.length <= ERROR_LOG_FIELD_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, ERROR_LOG_FIELD_MAX_LENGTH)}...`;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}
