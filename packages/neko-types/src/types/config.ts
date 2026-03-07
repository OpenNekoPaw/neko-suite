// =============================================================================
// Configuration Types (Shared between Extension and WebView)
// =============================================================================

// =============================================================================
// Provider Configuration
// =============================================================================

// =============================================================================
// Protocol Variant Configuration (for OpenAI-compatible APIs)
// =============================================================================

/**
 * Authentication type for API requests
 */
export type AuthType = 'bearer' | 'api-key' | 'custom-header';

/**
 * Stream format for streaming responses
 */
export type StreamFormat = 'sse' | 'ndjson';

/**
 * Protocol variant configuration for OpenAI-compatible APIs.
 * Used by GenericAdapter to handle different API implementations.
 */
export interface ProtocolVariant {
  /**
   * Base path prefix for API endpoints.
   * Default: '/v1'
   * Set to '' if the apiUrl already includes the path (e.g., https://api.example.com/v1)
   */
  basePath?: string;

  /**
   * Authentication type.
   * Default: 'bearer'
   * - 'bearer': Authorization: Bearer <token>
   * - 'api-key': x-api-key: <token>
   * - 'custom-header': Uses authHeader field
   */
  authType?: AuthType;

  /**
   * Custom authentication header name.
   * Only used when authType is 'custom-header'.
   */
  authHeader?: string;

  /**
   * Stream format for streaming responses.
   * Default: 'sse'
   * - 'sse': Server-Sent Events (data: ...)
   * - 'ndjson': Newline Delimited JSON
   */
  streamFormat?: StreamFormat;

  /**
   * Stream end marker.
   * Default: '[DONE]'
   * Some APIs use different markers like '[END]' or empty line.
   */
  streamDoneMarker?: string;

  /**
   * Extra headers to include in requests.
   * Useful for APIs requiring custom headers.
   */
  extraHeaders?: Record<string, string>;
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Supported provider types
 */
export type ProviderType =
  // LLM providers
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'generic'
  // Media generation providers
  | 'xai'
  | 'kling'
  | 'runway'
  | 'luma'
  | 'minimax'
  | 'jimeng'
  | 'liblib'
  | 'suno'
  | 'vidu'
  | 'midjourney';

/**
 * AI service provider configuration
 */
export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;
  /** API identifier used when calling the API */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Provider type for adapter selection */
  type: ProviderType;
  /** API endpoint URL */
  apiUrl: string;
  /** API key (optional, can be set via environment) */
  apiKey?: string;
  /** Whether provider is enabled */
  enabled: boolean;
  /** Whether this is a builtin provider */
  builtin?: boolean;
  /**
   * Whether provider supports beta/experimental features (e.g., extended thinking).
   * Set to false for proxy services like nekoapi that may not support beta headers.
   * Defaults to true for official API endpoints.
   */
  supportsBeta?: boolean;
  /**
   * Use Authorization: Bearer instead of x-api-key header.
   * Set to true for proxy services like newapi/one-api that expect Bearer auth.
   * Defaults to false (use native x-api-key for Anthropic).
   */
  useBearerAuth?: boolean;
  /** Provider-specific options */
  options?: Record<string, unknown>;
  /**
   * Protocol variant configuration for OpenAI-compatible APIs.
   * Only used when type is 'generic'.
   * Allows customizing URL paths, authentication, and streaming behavior.
   */
  protocolVariant?: ProtocolVariant;
}

/**
 * Provider template for adding new providers
 * Similar to ProviderConfig but without enabled/builtin flags
 */
export interface ProviderTemplate {
  /** Template identifier */
  id: string;
  /** API identifier */
  name: string;
  /** Display name for UI dropdown */
  displayName: string;
  /** Provider type for adapter selection */
  type: ProviderType;
  /** Default API endpoint URL */
  apiUrl: string;
  /**
   * Protocol variant configuration for OpenAI-compatible APIs.
   * Included in template to provide sensible defaults for the provider.
   */
  protocolVariant?: ProtocolVariant;
}

/**
 * Model capabilities
 */
export type ModelCapability =
  // LLM capabilities
  | 'chat'
  | 'completion'
  | 'vision'
  | 'function_calling'
  | 'json_mode'
  | 'streaming'
  | 'embedding'
  | 'code'
  | 'audio'
  // Media generation capabilities
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_video'
  | 'image_to_video'
  | 'video_to_video'
  | 'text_to_audio'
  | 'text_to_music'
  | 'workflow'
  // Legacy aliases (for backwards compatibility)
  | 'image_generation'
  | 'video_generation';

/**
 * Model configuration
 */
export interface ModelConfig {
  /** Unique model identifier */
  id: string;
  /** API model name used when calling the API */
  name: string;
  /** Display name for UI */
  displayName?: string;
  /** Provider this model belongs to */
  providerId: string;
  /**
   * Protocol/adapter type for this model.
   * Overrides provider's type if specified.
   * Use this when a provider supports multiple protocols (e.g., nekoapi supports both OpenAI and Anthropic formats)
   */
  protocol?: ProviderType;
  /**
   * Use Authorization: Bearer instead of x-api-key header.
   * Overrides provider's useBearerAuth if specified.
   * Set to true for proxy services like newapi/one-api that expect Bearer auth.
   */
  useBearerAuth?: boolean;
  /**
   * Whether this model supports beta/experimental features (e.g., extended thinking).
   * Overrides provider's supportsBeta if specified.
   * Set to false for proxy services that don't support beta headers.
   */
  supportsBeta?: boolean;
  /** Model capabilities */
  capabilities: ModelCapability[] | string[];
  /** Context window size in tokens */
  contextWindow?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Cost per 1K input tokens (USD) */
  inputCostPer1k?: number;
  /** Cost per 1K output tokens (USD) */
  outputCostPer1k?: number;
  /** Whether model is enabled */
  enabled: boolean;
  /** Model-specific options */
  options?: Record<string, unknown>;
}

// =============================================================================
// MCP Server Configuration
// =============================================================================

export type MCPServerCategory =
  | 'filesystem'
  | 'database'
  | 'api'
  | 'development'
  | 'productivity'
  | 'ai'
  | 'other';

export interface MCPToolInfo {
  name: string;
  description: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  category: MCPServerCategory;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
  builtin?: boolean;
  homepage?: string;
  tools?: MCPToolInfo[];
}

// =============================================================================
// Workflow Configuration
// =============================================================================

export type WorkflowEngineType =
  | 'comfyui'
  | 'dify'
  | 'n8n'
  | 'make'
  | 'zapier'
  | 'langflow'
  | 'flowise'
  | 'custom';

export type WorkflowCategory =
  | 'image-generation'
  | 'ai-workflow'
  | 'automation'
  | 'integration';

export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  engineType: WorkflowEngineType;
  url: string;
  icon?: string;
  category: WorkflowCategory;
  docsUrl?: string;
  requiresApiKey?: boolean;
  defaultPort?: number;
  enabled: boolean;
  builtin?: boolean;
  /** Provider ID for authentication (alternative to apiKey) */
  providerId?: string;
  apiKey?: string;
}

// =============================================================================
// Prompt Preset Configuration
// =============================================================================

export type PromptPresetType =
  | 'chat'
  | 'coder'
  | 'screenwriter'
  | 'storyboard'
  | 'image'
  | 'video'
  | 'audio'
  | 'plan'
  | 'custom';

/**
 * Prompt source - where the prompt configuration comes from
 */
export type PromptSource = 'builtin' | 'personal' | 'project';

export interface PromptPresetConfig {
  id: string;
  name: string;
  nameKey?: string;
  type: PromptPresetType;
  description: string;
  descriptionKey?: string;
  systemPrompt: string;
  icon?: string;
  autoExecuteTools?: boolean;
  streamResponses?: boolean;
  showToolCalls?: boolean;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: string;
  preferredModel?: string;
  enabled: boolean;
  builtin?: boolean;
  /** Source of the prompt configuration */
  source?: PromptSource;
  /** File path for user/project prompts (used for "Open in VSCode" feature) */
  filePath?: string;
  /** Internal prompts are not shown in the UI */
  internal?: boolean;
}

// =============================================================================
// Aggregated Configuration State
// =============================================================================

/**
 * Task-type to model mapping for explicit routing
 */
export interface TaskDefaults {
  /** Model ID for text chat tasks */
  chat?: { modelId: string };
  /** Model ID for vision/multimodal tasks */
  vision?: { modelId: string };
  /** Model ID for video generation tasks */
  videoGeneration?: { modelId: string };
  /** Model ID for audio generation tasks */
  audioGeneration?: { modelId: string };
  /** Model ID for image generation tasks */
  imageGeneration?: { modelId: string };
}

export interface ConfigState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  mcpServers: MCPServerConfig[];
  workflows: WorkflowConfig[];
  prompts: PromptPresetConfig[];
  /** Configured skills (semantic discovery) */
  skills?: import('./skill').ConfiguredSkill[];
  /** Configured slash commands */
  commands?: import('./skill').ConfiguredSlashCommand[];
  /** Task-type to model defaults */
  taskDefaults?: TaskDefaults;
}

// =============================================================================
// User-configured items (with user overrides applied)
// =============================================================================

export interface ConfiguredMCPServer extends MCPServerConfig {
  /** Connection status */
  status?: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

export interface ConfiguredWorkflow extends WorkflowConfig {
  /** Connection status */
  status?: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

export interface ConfiguredPrompt extends PromptPresetConfig {
  // Additional runtime state can be added here
}

// =============================================================================
// Chat Model Options (for UI model selector)
// =============================================================================

/**
 * Model category for UI grouping
 */
export type ModelCategory = 'chat' | 'image' | 'video' | 'audio' | 'other';

/**
 * Chat model option for UI model selector dropdown
 * Built by Platform layer from enabled providers and models
 */
export interface ChatModelOption {
  /** Unique identifier: 'auto' or 'providerId:modelId' */
  id: string;
  /** Display label: 'Auto' or 'Provider Name / Model Name' */
  label: string;
  /** Provider ID (empty string for 'auto') */
  providerId: string;
  /** Model ID (empty string for 'auto') */
  modelId: string;
  /** Model capabilities (optional, for filtering) */
  capabilities?: ModelCapability[];
  /** Model category for UI grouping */
  category?: ModelCategory;
}
