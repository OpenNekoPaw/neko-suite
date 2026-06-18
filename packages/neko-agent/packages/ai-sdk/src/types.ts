/**
 * AI SDK Provider Types
 *
 * Shared types for the AI SDK integration layer.
 */

import type { ImageModelV3, Experimental_VideoModelV3, SpeechModelV3 } from '@ai-sdk/provider';

/**
 * Configuration for creating an AI SDK provider instance
 */
export interface ProviderConfig {
  /** API endpoint URL */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Optional task callback for providers that expose external task IDs */
  onExternalTaskId?: (externalTaskId: string) => void | Promise<void>;
}

/**
 * Resolved AI SDK provider with media model factories.
 * Returns null for unsupported model types.
 */
export type ResolvedProviderSource = 'native' | 'legacy-bridge';

export interface ResolvedProvider {
  /** Provider type identifier */
  type: string;
  /** Whether this provider was resolved through a native AI SDK path or legacy bridge */
  source: ResolvedProviderSource;
  /** Create an image model by model ID, or null if not supported */
  image(modelId: string): ImageModelV3 | null;
  /** Create a video model by model ID, or null if not supported */
  video(modelId: string): Experimental_VideoModelV3 | null;
  /** Create a speech model by model ID, or null if not supported */
  speech(modelId: string): SpeechModelV3 | null;
}

/**
 * Minimal interface for legacy MediaAdapter bridging.
 * Mirrors MediaAdapter from @neko/platform without importing it.
 */
export interface LegacyMediaAdapter {
  generateImage(request: unknown, model: unknown, provider: unknown): Promise<LegacyAdapterResult>;
  generateVideo(request: unknown, model: unknown, provider: unknown): Promise<LegacyAdapterResult>;
  generateAudio(request: unknown, model: unknown, provider: unknown): Promise<LegacyAdapterResult>;
  getTaskStatus(taskId: string, provider: unknown): Promise<LegacyAdapterResult>;
}

export interface LegacyAdapterResult {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  externalTaskId?: string;
  progress?: number;
  outputs?: Array<LegacyMediaOutput>;
  error?: { code: string; message: string; retryable: boolean };
  metadata?: Record<string, unknown>;
}

export interface LegacyMediaOutput {
  type: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
}
