/**
 * Base Media Adapter - Common functionality for media adapters
 *
 * Uses shared HttpClient for HTTP operations.
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaAdapter,
  MediaGenerationType,
  MediaAdapterResult,
  MediaAdapterError,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
} from '../types';
import {
  HttpClient,
  getHttpClient,
  type HttpResult,
} from '../../core/http-client';

/**
 * Abstract base adapter with common functionality
 */
export abstract class BaseMediaAdapter implements MediaAdapter {
  abstract readonly type: string;

  /** Shared HTTP client instance */
  protected readonly http: HttpClient = getHttpClient();

  /**
   * Get supported generation types
   */
  abstract getSupportedTypes(): MediaGenerationType[];

  /**
   * Check if adapter supports the given generation type
   */
  supportsType(type: MediaGenerationType): boolean {
    return this.getSupportedTypes().includes(type);
  }

  /**
   * Generate image - must be implemented by subclasses that support it
   */
  async generateImage(
    _request: ImageGenerationRequest,
    _model: Model,
    _provider: Provider
  ): Promise<MediaAdapterResult> {
    return this.notSupportedResult('text-to-image');
  }

  /**
   * Generate video - must be implemented by subclasses that support it
   */
  async generateVideo(
    _request: VideoGenerationRequest,
    _model: Model,
    _provider: Provider
  ): Promise<MediaAdapterResult> {
    return this.notSupportedResult('text-to-video');
  }

  /**
   * Generate audio - must be implemented by subclasses that support it
   */
  async generateAudio(
    _request: AudioGenerationRequest,
    _model: Model,
    _provider: Provider
  ): Promise<MediaAdapterResult> {
    return this.notSupportedResult('text-to-audio');
  }

  /**
   * Get task status - must be implemented for async polling
   */
  abstract getTaskStatus(
    externalTaskId: string,
    provider: Provider
  ): Promise<MediaAdapterResult>;

  /**
   * Cancel a running task
   */
  abstract cancelTask(externalTaskId: string, provider: Provider): Promise<void>;

  /**
   * Create error result
   */
  protected createErrorResult(
    code: string,
    message: string,
    retryable: boolean = false,
    retryAfterMs?: number
  ): MediaAdapterResult {
    return {
      status: 'failed',
      error: {
        code,
        message,
        retryable,
        retryAfterMs,
      },
    };
  }

  /**
   * Create not supported result
   */
  protected notSupportedResult(type: MediaGenerationType): MediaAdapterResult {
    return this.createErrorResult(
      'NOT_SUPPORTED',
      `${type} is not supported by ${this.type} adapter`
    );
  }

  /**
   * Build authorization header
   */
  protected buildAuthHeader(provider: Provider): Record<string, string> {
    if (provider.apiKey) {
      return this.http.buildBearerAuth(provider.apiKey);
    }
    return {};
  }

  /**
   * Make HTTP request with error handling
   * Returns result object with data or error (never throws)
   */
  protected async request<T>(
    url: string,
    options: RequestInit,
    provider: Provider
  ): Promise<{ data?: T; error?: MediaAdapterError }> {
    const result = await this.http.requestSafe<T>({
      url,
      method: (options.method as 'GET' | 'POST' | 'PUT' | 'DELETE') || 'GET',
      headers: {
        ...this.buildAuthHeader(provider),
        ...(options.headers as Record<string, string>),
      },
      body: options.body ? JSON.parse(options.body as string) : undefined,
    });

    if (result.success) {
      return { data: result.data };
    }

    return {
      error: {
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
        retryAfterMs: result.error.retryAfterMs,
      },
    };
  }

  /**
   * Make simple HTTP request (throws on error)
   * Use when you want to handle errors with try/catch
   */
  protected async requestSimple<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    provider: Provider,
    body?: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<T> {
    return this.http.request<T>(
      {
        url,
        method,
        headers: {
          ...this.buildAuthHeader(provider),
          ...additionalHeaders,
        },
        body,
      },
      `${this.type} API error`
    );
  }

  /**
   * Convert HttpResult to MediaAdapterResult for polling
   */
  protected httpResultToAdapterResult<T>(
    result: HttpResult<T>,
    transform: (data: T) => MediaAdapterResult
  ): MediaAdapterResult {
    if (result.success) {
      return transform(result.data);
    }

    return {
      status: 'failed',
      error: {
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
        retryAfterMs: result.error.retryAfterMs,
      },
    };
  }
}
