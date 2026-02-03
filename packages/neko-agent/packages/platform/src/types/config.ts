/**
 * Configuration Types - Types for builtin presets and user configuration
 */

// =============================================================================
// MCP Server Configuration Types
// =============================================================================

/**
 * MCP server category
 */
export type MCPServerCategory =
  | 'filesystem'
  | 'database'
  | 'api'
  | 'development'
  | 'productivity'
  | 'ai'
  | 'other';

/**
 * MCP tool info (for display purposes)
 */
export interface MCPToolInfo {
  name: string;
  description: string;
}

/**
 * MCP server preset configuration
 */
export interface MCPServerPreset {
  /** Server ID */
  id: string;
  /** Server name */
  name: string;
  /** Server description */
  description: string;
  /** Category */
  category: MCPServerCategory;
  /** Transport type */
  transport: 'stdio' | 'http';
  /** Command to run (for stdio) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Server URL (for http) */
  url?: string;
  /** Whether server is enabled */
  enabled: boolean;
  /** Whether this is a builtin preset */
  builtin?: boolean;
  /** Homepage URL */
  homepage?: string;
  /** Available tools */
  tools?: MCPToolInfo[];
}

// =============================================================================
// Workflow Configuration Types
// =============================================================================

/**
 * Workflow engine type
 */
export type WorkflowEngineType =
  | 'comfyui'
  | 'dify'
  | 'n8n'
  | 'make'
  | 'zapier'
  | 'langflow'
  | 'flowise'
  | 'custom';

/**
 * Workflow category
 */
export type WorkflowCategory =
  | 'image-generation'
  | 'ai-workflow'
  | 'automation'
  | 'integration';

/**
 * Workflow preset configuration
 */
export interface WorkflowPreset {
  /** Workflow ID */
  id: string;
  /** Workflow name */
  name: string;
  /** Workflow description */
  description: string;
  /** Engine type */
  engineType: WorkflowEngineType;
  /** Server URL */
  url: string;
  /** Icon */
  icon?: string;
  /** Category */
  category: WorkflowCategory;
  /** Documentation URL */
  docsUrl?: string;
  /** Whether API key is required */
  requiresApiKey?: boolean;
  /** Default port for local instances */
  defaultPort?: number;
  /** Whether workflow is enabled */
  enabled: boolean;
  /** Whether this is a builtin preset */
  builtin?: boolean;
  /** API key (user-provided) */
  apiKey?: string;
}

// =============================================================================
// Prompt Preset Configuration Types
// =============================================================================

/**
 * Prompt preset type
 */
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

/**
 * Prompt preset configuration (system prompts for different use cases)
 */
export interface PromptPreset {
  /** Prompt ID */
  id: string;
  /** Prompt name */
  name: string;
  /** Prompt type */
  type: PromptPresetType;
  /** Prompt description */
  description: string;
  /** System prompt content */
  systemPrompt: string;
  /** Icon */
  icon?: string;
  /** Whether to auto-execute tools */
  autoExecuteTools?: boolean;
  /** Whether to stream responses */
  streamResponses?: boolean;
  /** Whether to show tool calls */
  showToolCalls?: boolean;
  /** Temperature for generation */
  temperature?: number;
  /** Max tokens for generation */
  maxTokens?: number;
  /** Preferred provider ID */
  preferredProvider?: string;
  /** Preferred model ID */
  preferredModel?: string;
  /** Whether prompt is enabled */
  enabled: boolean;
  /** Whether this is a builtin preset */
  builtin?: boolean;
  /** Source of the prompt configuration */
  source?: PromptSource;
  /** File path for user/project prompts (used for "Open in VSCode" feature) */
  filePath?: string;
  /** Internal prompts are not shown in the UI */
  internal?: boolean;
}

