/**
 * Base Adapter - Common adapter functionality
 *
 * Uses shared HttpClient for HTTP operations.
 */

import type {
  Adapter,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ImageGenerationOptions,
  ImageGenerationResult,
  ApiKeyValidationResult,
} from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';
import { HttpClient, getHttpClient, type HttpRequestConfig } from '../../core/http-client';

// Re-export HttpRequestConfig for backward compatibility
export type { HttpRequestConfig };

/**
 * Provider credentials extracted from Provider config
 */
export interface ProviderCredentials {
  apiKey: string;
  apiUrl: string;
}

/**
 * Abstract base adapter with common functionality
 */
export abstract class BaseAdapter implements Adapter {
  abstract readonly type: string;

  /** Shared HTTP client instance */
  protected readonly http: HttpClient = getHttpClient();

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
    const supportedCapabilities = this.getSupportedCapabilities();
    return supportedCapabilities.includes(capability);
  }

  /**
   * Get list of supported capabilities
   */
  protected abstract getSupportedCapabilities(): string[];

  /**
   * Send chat request
   */
  abstract chat(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): Promise<ChatResponse>;

  /**
   * Send streaming chat request
   */
  abstract chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): AsyncIterable<ChatChunk>;

  /**
   * Generate embeddings (optional)
   */
  embed?(input: string | string[], model: Model, provider: Provider): Promise<number[][]>;

  /**
   * Generate image (optional)
   */
  generateImage?(
    prompt: string,
    options: ImageGenerationOptions,
    model: Model,
    provider: Provider,
  ): Promise<ImageGenerationResult>;

  // ==========================================================================
  // HTTP Request Helper Methods (delegating to shared HttpClient)
  // ==========================================================================

  /**
   * Make HTTP request and parse JSON response
   */
  protected async httpRequest<T>(config: HttpRequestConfig & { errorPrefix?: string }): Promise<T> {
    return this.http.request<T>(config, config.errorPrefix);
  }

  /**
   * Make streaming HTTP request and yield SSE data lines
   */
  protected async *httpStream(
    config: HttpRequestConfig & { errorPrefix?: string },
  ): AsyncIterable<string> {
    yield* this.http.stream(config, config.errorPrefix);
  }

  /**
   * Extract API credentials from provider config
   */
  protected getCredentials(
    provider: Provider,
    envKeyName?: string,
    defaultApiUrl?: string,
  ): ProviderCredentials {
    const apiKey = provider.apiKey || (envKeyName ? process.env[envKeyName] : undefined);
    if (!apiKey) {
      throw new Error(`${this.type} API key not configured`);
    }

    return {
      apiKey,
      apiUrl: provider.apiUrl || defaultApiUrl || '',
    };
  }

  /**
   * Build Authorization header with Bearer token
   */
  protected buildBearerAuth(apiKey: string): Record<string, string> {
    return this.http.buildBearerAuth(apiKey);
  }

  // ==========================================================================
  // API Key Validation
  // ==========================================================================

  /**
   * Validate API key by making a test request
   * Default implementation tries to fetch models list, subclasses can override
   * @param provider Provider configuration
   * @param _modelName Optional model name (not used in base implementation, but available for subclasses)
   */
  async validateApiKey(provider: Provider, _modelName?: string): Promise<ApiKeyValidationResult> {
    try {
      const apiUrl = provider.apiUrl?.replace(/\/+$/, '');
      const apiKey = provider.apiKey;

      if (!apiUrl) {
        return { valid: false, error: 'API URL not configured' };
      }
      if (!apiKey) {
        return { valid: false, error: 'API key not configured' };
      }

      // Try to fetch models list as a validation check
      const response = await fetch(`${apiUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        return { valid: true };
      }

      // Handle common error codes
      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }
      if (response.status === 403) {
        return { valid: false, error: 'Access denied' };
      }
      if (response.status === 429) {
        return { valid: false, error: 'Rate limit exceeded' };
      }

      return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: message };
    }
  }
}
