/**
 * Service Types - Unified service interface
 */

import type { AgentTraceContext } from '@neko/shared';
import type { ChatOptions, ChatResponse, ChatChunk } from './adapter';

/**
 * Service options extending chat options
 */
export interface ServiceOptions extends ChatOptions {
  /** Specific provider ID. Chat requests require this together with modelId. */
  providerId?: string;
  /** Specific model ID. Chat requests require this together with providerId. */
  modelId?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Abort signal */
  signal?: AbortSignal;
}

export interface ServiceCallContext {
  readonly trace?: AgentTraceContext;
}

export type ModelCallRecordKind = 'request' | 'response' | 'failure';

export interface ModelCallRecord {
  readonly schema: 'neko.model-call.v1';
  readonly kind: ModelCallRecordKind;
  readonly requestId: string;
  readonly timestamp: number;
  readonly providerId: string;
  readonly modelId: string;
  readonly stream: boolean;
  readonly attempt: number;
  readonly trace: AgentTraceContext;
  readonly payload: Record<string, unknown>;
}

export interface ModelCallRecorder {
  record(record: ModelCallRecord): void | Promise<void>;
  flush?(): Promise<void>;
  dispose?(): void | Promise<void>;
}

/**
 * Service response with additional metadata
 */
export interface ServiceResponse extends ChatResponse {
  /** Routing information */
  routing: {
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
 * Embedding options
 */
export interface EmbeddingOptions {
  /** Specific provider ID */
  providerId?: string;
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
  /** Specific model ID */
  modelId?: string;
  /** Video duration in seconds */
  duration?: number;
  /** Video resolution */
  resolution?: string;
  /** Frame rate */
  fps?: number;
}
