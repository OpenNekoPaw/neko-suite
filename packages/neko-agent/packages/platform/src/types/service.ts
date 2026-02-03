/**
 * Service Types - Unified service interface
 */

import type { ChatMessage, ChatOptions, ChatResponse, ChatChunk } from './adapter';
import type { ToolResult } from './tool';

/**
 * Service options extending chat options
 */
export interface ServiceOptions extends ChatOptions {
  /** Group ID for routing */
  groupId?: string;
  /** Specific model ID (overrides group routing) */
  modelId?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Abort signal */
  signal?: AbortSignal;
  /** Session ID for session-scoped circuit breaker isolation */
  sessionId?: string;
}

/**
 * Service response with additional metadata
 */
export interface ServiceResponse extends ChatResponse {
  /** Routing information */
  routing: {
    groupId?: string;
    modelId: string;
    providerId: string;
    attempts: number;
  };
  /** Timing information */
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

/**
 * Streaming service response
 */
export interface ServiceStreamResponse {
  /** Async iterator of chunks */
  stream: AsyncIterable<ChatChunk>;
  /** Promise that resolves to final response */
  response: Promise<ServiceResponse>;
}

/**
 * Chat with tools options
 */
export interface ChatWithToolsOptions extends ServiceOptions {
  /** Maximum tool call iterations */
  maxIterations?: number;
  /** Tool execution handler */
  onToolCall?: (toolCall: { name: string; arguments: Record<string, unknown> }) => Promise<ToolResult>;
}

/**
 * Embedding options
 */
export interface EmbeddingOptions {
  /** Group ID for routing */
  groupId?: string;
  /** Specific model ID */
  modelId?: string;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Image generation service options
 */
export interface ImageGenerationServiceOptions {
  /** Group ID for routing */
  groupId?: string;
  /** Specific model ID */
  modelId?: string;
  /** Image size */
  size?: string;
  /** Image quality */
  quality?: 'standard' | 'hd';
  /** Image style */
  style?: 'natural' | 'vivid';
  /** Number of images */
  n?: number;
}

/**
 * Video generation service options
 */
export interface VideoGenerationServiceOptions {
  /** Group ID for routing */
  groupId?: string;
  /** Specific model ID */
  modelId?: string;
  /** Video duration in seconds */
  duration?: number;
  /** Video resolution */
  resolution?: string;
  /** Frame rate */
  fps?: number;
}
