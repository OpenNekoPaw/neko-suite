/**
 * Anthropic Adapter - Using AI SDK
 *
 * Uses @ai-sdk/anthropic for API integration.
 * Supports both official Anthropic API and proxy services (newapi, one-api, etc.)
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { AISdkAdapter } from './ai-sdk-adapter';
import type { ChatOptions, ModelInfo, ModelInfoCapability } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';
import { getLogger } from '../../utils/logger';

const logger = getLogger('AnthropicAdapter');

/**
 * Options for proxy-compatible fetch wrapper
 */
interface ProxyFetchOptions {
  /** Strip anthropic-beta header (for proxy services that don't support beta features) */
  stripBetaHeader: boolean;
  /** Use Authorization: Bearer instead of x-api-key (for proxy services like newapi) */
  useBearerAuth: boolean;
  /** API key for Bearer auth */
  apiKey?: string;
}

/**
 * Create a fetch wrapper for proxy service compatibility
 * Handles:
 * 1. Stripping anthropic-beta header
 * 2. Converting x-api-key to Authorization: Bearer
 * 3. Removing trailing slash from URL
 */
function createProxyCompatibleFetch(options: ProxyFetchOptions): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    // Normalize URL - remove trailing slash before /messages
    let url = typeof input === 'object' && 'url' in input ? input.url : input.toString();
    // Fix double slash issue: /v1//messages -> /v1/messages
    url = url.replace(/\/+/g, '/').replace(':/', '://');

    if (init?.headers) {
      const headers = new Headers(init.headers);

      // Strip anthropic-beta header if needed
      if (options.stripBetaHeader && headers.has('anthropic-beta')) {
        logger.debug('Stripping anthropic-beta header for proxy compatibility');
        headers.delete('anthropic-beta');
      }

      // Convert to Bearer auth if needed
      if (options.useBearerAuth && options.apiKey) {
        // Remove x-api-key and add Authorization: Bearer
        if (headers.has('x-api-key')) {
          logger.debug('Converting x-api-key to Authorization: Bearer for proxy compatibility');
          headers.delete('x-api-key');
        }
        headers.set('Authorization', `Bearer ${options.apiKey}`);
      }

      init = { ...init, headers };
    }

    return fetch(url, init);
  };
}

/**
 * Anthropic adapter using AI SDK
 */
export class AnthropicAdapter extends AISdkAdapter {
  readonly type = 'anthropic';

  // AI SDK appends /messages to baseURL, so we need /v1 here
  private static readonly DEFAULT_API_URL = 'https://api.anthropic.com/v1';
  private static readonly ENV_KEY_NAME = 'ANTHROPIC_API_KEY';

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'vision', 'function_calling', 'streaming', 'thinking'];
  }

  /**
   * Get the AI SDK Anthropic language model
   */
  protected getLanguageModel(model: Model, provider: Provider): LanguageModel {
    const apiKey = provider.apiKey || process.env[AnthropicAdapter.ENV_KEY_NAME];
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Normalize baseURL - remove trailing slash
    let baseURL = provider.apiUrl || AnthropicAdapter.DEFAULT_API_URL;
    baseURL = baseURL.replace(/\/+$/, '');

    // Proxy compatibility options
    // Priority: model > provider > default
    const supportsBeta = model.supportsBeta ?? provider.supportsBeta ?? true;
    const useBearerAuth = model.useBearerAuth ?? provider.useBearerAuth ?? false;
    const needsProxyCompat = !supportsBeta || useBearerAuth;

    logger.debug('Creating model', {
      model: model.name,
      baseURL,
      supportsBeta,
      useBearerAuth,
      needsProxyCompat,
      modelOverrides: { supportsBeta: model.supportsBeta, useBearerAuth: model.useBearerAuth },
    });

    const anthropic = createAnthropic({
      apiKey,
      baseURL,
      // Use custom fetch for proxy service compatibility
      fetch: needsProxyCompat
        ? createProxyCompatibleFetch({
            stripBetaHeader: !supportsBeta,
            useBearerAuth,
            apiKey,
          })
        : undefined,
    });

    return anthropic(model.name);
  }

  /**
   * Get Anthropic-specific provider options
   */
  protected override getProviderOptions(
    options: ChatOptions,
    provider: Provider,
    model: Model,
  ): Record<string, unknown> {
    const providerOptions: Record<string, unknown> = {};

    // Extended thinking support (requires beta features)
    // Skip if model or provider explicitly disables beta features (e.g., proxy services like nekoapi)
    // Priority: model > provider > default (true)
    const supportsBeta = model.supportsBeta ?? provider.supportsBeta ?? true;

    logger.debug('getProviderOptions', {
      providerId: provider.id,
      modelId: model.id,
      modelSupportsBeta: model.supportsBeta,
      providerSupportsBeta: provider.supportsBeta,
      supportsBetaResolved: supportsBeta,
      thinkingBudget: options.thinkingBudget,
      willEnableThinking: supportsBeta && options.thinkingBudget && options.thinkingBudget > 0,
    });

    if (options.providerOptions) {
      providerOptions.providerOptions = options.providerOptions;
    }

    if (supportsBeta && options.thinkingBudget && options.thinkingBudget > 0) {
      providerOptions.providerOptions = mergeProviderOptions(providerOptions.providerOptions, {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: options.thinkingBudget,
          },
        },
      });
    }

    // Prompt caching: convert structured sections to AI SDK system message format
    if (options.systemPromptSections && options.systemPromptSections.length > 0) {
      providerOptions.system = options.systemPromptSections.map((section) => {
        const part: Record<string, unknown> = {
          type: 'text',
          text: section.content,
        };
        if (section.cacheControl) {
          part.providerOptions = {
            anthropic: {
              cacheControl: { type: section.cacheControl },
            },
          };
        }
        return part;
      });
      logger.debug('Prompt caching: system prompt split into sections', {
        sectionCount: options.systemPromptSections.length,
        cachedSections: options.systemPromptSections.filter((s) => s.cacheControl).length,
      });
    }

    logger.debug('providerOptions result', { providerOptions });
    return providerOptions;
  }

  /**
   * List available models
   */
  override async listModels(_provider: Provider): Promise<string[]> {
    // Anthropic doesn't have a models list API, return known models
    return [
      'claude-opus-4-5-20251101',
      'claude-sonnet-4-5-20251101',
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
    ];
  }

  /**
   * List available models with details
   */
  override async listModelsDetailed(_provider: Provider): Promise<ModelInfo[]> {
    const models = await this.listModels(_provider);
    return models.map((id) => this.inferModelCapabilities(id));
  }

  /**
   * Infer model capabilities from model ID
   */
  private inferModelCapabilities(modelId: string): ModelInfo {
    const capabilities: ModelInfoCapability[] = ['chat', 'stream', 'vision', 'function_call'];

    // Opus models support extended thinking
    if (modelId.includes('opus')) {
      // Extended thinking is a special capability
    }

    return {
      id: modelId,
      name: this.getModelDisplayName(modelId),
      capabilities,
      owner: 'anthropic',
    };
  }

  /**
   * Get human-readable model name
   */
  private getModelDisplayName(modelId: string): string {
    if (modelId.includes('opus-4-5')) return 'Claude Opus 4.5';
    if (modelId.includes('sonnet-4-5')) return 'Claude Sonnet 4.5';
    if (modelId.includes('3-5-sonnet')) return 'Claude 3.5 Sonnet';
    if (modelId.includes('3-5-haiku')) return 'Claude 3.5 Haiku';
    if (modelId.includes('3-opus')) return 'Claude 3 Opus';
    return modelId;
  }
}

function mergeProviderOptions(
  base: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const result =
    base && typeof base === 'object' && !Array.isArray(base)
      ? { ...(base as Record<string, unknown>) }
      : {};

  for (const [namespace, value] of Object.entries(next)) {
    const existing = result[namespace];
    if (isRecord(existing) && isRecord(value)) {
      result[namespace] = { ...existing, ...value };
    } else {
      result[namespace] = value;
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
