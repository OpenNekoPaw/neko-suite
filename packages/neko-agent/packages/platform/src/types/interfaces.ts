/**
 * Core Service Interfaces
 *
 * This file defines abstract interfaces for core services to enable
 * Dependency Inversion - high-level modules depend on abstractions,
 * not concrete implementations.
 */

import type {
  ChatMessage,
  ModelInfo,
} from './adapter';
import type {
  ServiceOptions,
  ServiceResponse,
  ServiceStreamResponse,
  ChatWithToolsOptions,
  EmbeddingOptions,
  EmbeddingResponse,
} from './service';
import type {
  MediaTask,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
} from '../media/types';

// Re-export media request types for convenience
export type {
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
} from '../media/types';

/**
 * Service interface - abstraction for AI service operations
 *
 * High-level modules (Agent, Template) should depend on this interface,
 * not the concrete Service implementation.
 */
export interface IService {
  /**
   * Send a chat request and get a complete response
   */
  chat(
    messages: ChatMessage[],
    options?: ServiceOptions
  ): Promise<ServiceResponse>;

  /**
   * Send a chat request and get a streaming response
   */
  chatStream(
    messages: ChatMessage[],
    options?: ServiceOptions
  ): ServiceStreamResponse;

  /**
   * Chat with tool execution loop
   */
  chatWithTools(
    messages: ChatMessage[],
    options: ChatWithToolsOptions
  ): Promise<ServiceResponse>;

  /**
   * Generate embeddings for text
   */
  embed(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResponse>;

  /**
   * Check if media generation service is available
   */
  hasMediaGenerationService(): boolean;

  /**
   * Get the media generation service
   * @throws Error if not configured
   */
  getMediaGenerationService(): IMediaGenerationService;

  /**
   * List models for a provider
   */
  listProviderModels(providerId: string): Promise<string[]>;

  /**
   * Check if a provider supports model listing
   */
  supportsModelListing(providerId: string): boolean;

  /**
   * List models with detailed capability information
   */
  listProviderModelsDetailed(providerId: string): Promise<ModelInfo[]>;

  /**
   * Validate a provider's API key
   * Makes a test request to check if the key is valid
   * @param providerId Provider ID to validate
   * @param modelId Optional model ID - when specified, uses this model for validation test
   */
  validateProviderApiKey(
    providerId: string,
    modelId?: string
  ): Promise<{ valid: boolean; error?: string }>;

  /**
   * Check if a provider supports API key validation
   */
  supportsApiKeyValidation(providerId: string): boolean;
}

/**
 * Media generation service interface - abstraction for media generation
 *
 * Service layer should depend on this interface for optional media features,
 * not the concrete MediaGenerationService implementation.
 */
export interface IMediaGenerationService {
  /**
   * Generate an image from text or reference image
   */
  generateImage(request: ImageGenerationRequest): Promise<MediaTask>;

  /**
   * Generate a video from text, image, or reference video
   */
  generateVideo(request: VideoGenerationRequest): Promise<MediaTask>;

  /**
   * Generate audio or music from text
   */
  generateAudio(request: AudioGenerationRequest): Promise<MediaTask>;

  /**
   * Wait for a task to complete
   */
  waitForTask(taskId: string, timeoutMs?: number): Promise<MediaTask>;

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): Promise<boolean>;

  /**
   * Delete a task from storage
   */
  deleteTask(taskId: string): Promise<boolean>;

  /**
   * Get task status
   */
  getTask(taskId: string): Promise<MediaTask | undefined>;

  /**
   * Subscribe to task progress updates
   * @returns Unsubscribe function
   */
  onProgress(
    taskId: string,
    callback: (task: MediaTask) => void
  ): () => void;
}
