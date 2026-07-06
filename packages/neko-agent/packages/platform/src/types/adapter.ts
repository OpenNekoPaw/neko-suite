/**
 * Adapter Types
 */

import type { Model, Provider } from './provider';

/**
 * Message role
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
  name?: string;
  /** Provider reasoning content that must be replayed with assistant messages. */
  reasoningContent?: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

/**
 * Content part for multimodal messages
 */
export type ContentPart = TextPart | ImagePart | VideoPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  imageUrl: string;
  detail?: 'auto' | 'low' | 'high';
}

export interface VideoPart {
  type: 'video';
  /** Base64 data URI or URL to video content */
  videoUrl: string;
  /** MIME type (e.g., 'video/mp4', 'video/webm') */
  mimeType?: string;
}

/**
 * LLM tool call — OpenAI-compatible wire format.
 * Distinguished from the internal ToolCall in @neko-agent/types which uses
 * parsed arguments (Record<string, unknown>) and has result/confirmation fields.
 */
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded arguments string */
    arguments: string;
  };
}

/**
 * Chat request options
 */
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  responseFormat?: { type: 'text' | 'json_object' };
  stream?: boolean;
  /** Runtime prompt locale used by model-facing projection wrappers. */
  locale?: string;
  /** Enable extended thinking (Claude only) - budget tokens for thinking */
  thinkingBudget?: number;
  /**
   * Provider-specific AI SDK request options that have already been projected
   * from validated model capabilities. This is intentionally adapter-owned;
   * callers must not use it as an arbitrary raw parameter editor.
   */
  providerOptions?: Record<string, unknown>;
  /** Capabilities declared by the explicitly selected model. */
  modelCapabilities?: readonly string[];
  /** Abort signal for cancellation */
  signal?: AbortSignal;

  /**
   * Structured system prompt sections with cache control markers.
   * When provided, Anthropic adapter uses these to apply prompt caching
   * instead of sending a flat string. Other adapters ignore this field.
   */
  systemPromptSections?: Array<{
    content: string;
    cacheControl?: 'ephemeral';
  }>;

  /**
   * Optional async message projection hook used by platform adapters to enrich
   * generic chat history with provider-ready multimodal content at send time.
   */
  messageProjector?: (input: {
    messages: readonly ChatMessage[];
    providerId?: string;
    modelId?: string;
    modelCapabilities?: readonly string[];
    locale?: string;
  }) => Promise<readonly ChatMessage[]> | readonly ChatMessage[];
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Chat response
 */
export interface ChatResponse {
  id: string;
  model: string;
  message: ChatMessage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage: TokenUsage;
  /** Extended thinking content for UI presentation */
  thinking?: string;
  /** Provider reasoning content for protocol replay */
  reasoningContent?: string;
}

/**
 * Streaming chunk
 */
export interface ChatChunk {
  id: string;
  model: string;
  delta: Partial<ChatMessage>;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Extended thinking content delta for UI presentation */
  thinking?: string;
  /** Provider reasoning content delta for protocol replay */
  reasoningContent?: string;
  /** Token usage (available on finish chunk) */
  usage?: TokenUsage;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Adapter interface - protocol adapter for different AI providers
 */
export interface Adapter {
  /** Adapter type identifier */
  readonly type: string;

  /** Check if adapter supports streaming */
  supportsStreaming(): boolean;

  /** Check if adapter supports the given capability */
  supportsCapability(capability: string): boolean;

  /** Send chat request */
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): Promise<ChatResponse>;

  /** Send streaming chat request */
  chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): AsyncIterable<ChatChunk>;

  /** Generate embeddings */
  embed?(input: string | string[], model: Model, provider: Provider): Promise<number[][]>;

  /** Generate image */
  generateImage?(
    prompt: string,
    options: ImageGenerationOptions,
    model: Model,
    provider: Provider,
  ): Promise<ImageGenerationResult>;

  /** Generate video */
  generateVideo?(
    prompt: string,
    options: VideoGenerationOptions,
    model: Model,
    provider: Provider,
  ): Promise<VideoGenerationResult>;

  /**
   * List available models from the provider
   * Returns model IDs that can be used with this provider
   */
  listModels?(provider: Provider): Promise<string[]>;

  /**
   * List available models with detailed information
   * Returns model info including capabilities (chat, image-generation, etc.)
   */
  listModelsDetailed?(provider: Provider): Promise<ModelInfo[]>;

  /**
   * Validate API key by making a test request
   * Returns validation result with error message if invalid
   * @param provider Provider configuration
   * @param modelName Optional model name to use for validation (recommended for accurate testing)
   */
  validateApiKey?(provider: Provider, modelName?: string): Promise<ApiKeyValidationResult>;
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  /** Whether the API key is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Model information returned by listModelsDetailed
 */
export interface ModelInfo {
  /** Model ID/name to use in API calls */
  id: string;
  /** Optional display name */
  name?: string;
  /** Model capabilities */
  capabilities: ModelInfoCapability[];
  /** Optional owner/creator */
  owner?: string;
}

/**
 * Model capability types
 */
export type ModelInfoCapability =
  | 'chat'
  | 'vision'
  | 'function_call'
  | 'image-generation'
  | 'video-generation'
  | 'audio-generation'
  | 'embedding'
  | 'stream';

/**
 * Image generation options
 */
export interface ImageGenerationOptions {
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  n?: number;
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  images: Array<{
    url?: string;
    b64Json?: string;
    revisedPrompt?: string;
  }>;
}

/**
 * Video generation options
 */
export interface VideoGenerationOptions {
  /** Video duration in seconds */
  duration?: number;
  /** Video resolution (e.g., "1920x1080") */
  resolution?: string;
  /** Frame rate */
  fps?: number;
  /** Aspect ratio (e.g., "16:9") */
  aspectRatio?: string;
  /** Reference image URL for image-to-video */
  imageUrl?: string;
}

/**
 * Video generation result
 */
export interface VideoGenerationResult {
  /** Task ID for async polling (if async) */
  taskId?: string;
  /** Video URLs when completed */
  videos?: Array<{
    url: string;
    duration: number;
    resolution: string;
  }>;
  /** Status for async tasks */
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}
