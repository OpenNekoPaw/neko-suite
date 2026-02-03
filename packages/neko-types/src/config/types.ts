/**
 * Unified Configuration Types
 *
 * Shared configuration format for agent-cli and platform.
 * File locations:
 * - User config: ~/.neko/config.json
 * - Workspace config: .neko/config.json
 */

import type {
  ProviderConfig,
  ModelConfig,
  MCPServerConfig,
  WorkflowConfig,
  PromptPresetConfig,
} from '../types/config';

// =============================================================================
// Group Configuration (from platform)
// =============================================================================

/**
 * Model group configuration
 */
export interface GroupConfig {
  /** Unique group identifier */
  id: string;
  /** Group name */
  name: string;
  /** Group description */
  description?: string;
  /** Provider ID for this group */
  providerId: string;
  /** Model ID for this group */
  modelId: string;
  /** Whether group is enabled */
  enabled: boolean;
  /** Whether this is a builtin group */
  builtin?: boolean;
}

// =============================================================================
// Template Configuration
// =============================================================================

/**
 * Template preset configuration
 */
export interface TemplatePresetConfig {
  /** Unique template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Template content */
  content: string;
  /** Template type */
  type?: string;
  /** Whether template is enabled */
  enabled: boolean;
  /** Whether this is a builtin template */
  builtin?: boolean;
}

// =============================================================================
// Unified Configuration Format
// =============================================================================

/**
 * Unified configuration file format
 *
 * This format is shared between agent-cli and platform.
 * Both can read from the same config file.
 *
 * @example
 * ```json
 * {
 *   "defaultProvider": "anthropic",
 *   "maxTokens": 8192,
 *   "temperature": 0.7,
 *   "providers": [
 *     {
 *       "id": "anthropic",
 *       "name": "anthropic",
 *       "displayName": "Anthropic",
 *       "type": "anthropic",
 *       "apiUrl": "https://api.anthropic.com",
 *       "apiKey": "sk-ant-xxx",
 *       "enabled": true
 *     }
 *   ],
 *   "models": [...],
 *   "mcpServers": [...]
 * }
 * ```
 */
export interface UnifiedConfig {
  // ==========================================================================
  // Basic Configuration
  // ==========================================================================

  /** Default provider ID */
  defaultProvider?: string;

  /** Default model ID */
  defaultModel?: string;

  /** Global default maxTokens */
  maxTokens?: number;

  /** Global default temperature */
  temperature?: number;

  /** Skills directory (agent-cli) */
  skillsDir?: string;

  /** Verbose output (agent-cli) */
  verbose?: boolean;

  /** Output format (agent-cli) */
  outputFormat?: 'text' | 'json' | 'markdown';

  // ==========================================================================
  // Resource Configuration (Array Format)
  // ==========================================================================

  /** Provider configurations */
  providers?: ProviderConfig[];

  /** Model configurations */
  models?: ModelConfig[];

  /** Model group configurations */
  groups?: GroupConfig[];

  /** MCP server configurations */
  mcpServers?: MCPServerConfig[];

  /** Workflow configurations */
  workflows?: WorkflowConfig[];

  /** Prompt preset configurations */
  prompts?: PromptPresetConfig[];

  /** Template configurations */
  templates?: TemplatePresetConfig[];

  // ==========================================================================
  // Override Configuration
  // ==========================================================================

  /** Provider overrides (keyed by provider ID) */
  providerOverrides?: Record<string, Partial<ProviderConfig>>;

  /** Model overrides (keyed by model ID) */
  modelOverrides?: Record<string, Partial<ModelConfig>>;

  /** Group overrides (keyed by group ID) */
  groupOverrides?: Record<string, Partial<GroupConfig>>;

  /** MCP server overrides (keyed by server ID) */
  mcpServerOverrides?: Record<string, Partial<MCPServerConfig>>;

  /** Workflow overrides (keyed by workflow ID) */
  workflowOverrides?: Record<string, Partial<WorkflowConfig>>;

  /** Prompt overrides (keyed by prompt ID) */
  promptOverrides?: Record<string, Partial<PromptPresetConfig>>;

  /** Template overrides (keyed by template ID) */
  templateOverrides?: Record<string, Partial<TemplatePresetConfig>>;

  // ==========================================================================
  // Legacy Fields (for backward compatibility)
  // ==========================================================================

  /**
   * Legacy: provider (use defaultProvider instead)
   * @deprecated Use defaultProvider
   */
  provider?: string;

  /**
   * Legacy: model (use defaultModel instead)
   * @deprecated Use defaultModel
   */
  model?: string;

  /**
   * Legacy: apiKey (use providers[].apiKey instead)
   * @deprecated Use providers[].apiKey
   */
  apiKey?: string;

  /**
   * Legacy: baseUrl (use providers[].apiUrl instead)
   * @deprecated Use providers[].apiUrl
   */
  baseUrl?: string;
}

// =============================================================================
// Normalized Configuration (Internal Use)
// =============================================================================

/**
 * Normalized configuration after processing
 *
 * This is the internal format used after merging and normalizing
 * user and workspace configurations.
 */
export interface NormalizedConfig {
  /** Default provider ID */
  defaultProvider: string;

  /** Default model ID */
  defaultModel: string;

  /** Global default maxTokens */
  maxTokens: number;

  /** Global default temperature */
  temperature: number;

  /** Skills directory */
  skillsDir?: string;

  /** Verbose output */
  verbose: boolean;

  /** Output format */
  outputFormat: 'text' | 'json' | 'markdown';

  /** Provider configurations (keyed by ID) */
  providers: Map<string, ProviderConfig>;

  /** Model configurations (keyed by ID) */
  models: Map<string, ModelConfig>;

  /** Group configurations (keyed by ID) */
  groups: Map<string, GroupConfig>;

  /** MCP server configurations (keyed by ID) */
  mcpServers: Map<string, MCPServerConfig>;

  /** Workflow configurations (keyed by ID) */
  workflows: Map<string, WorkflowConfig>;

  /** Prompt configurations (keyed by ID) */
  prompts: Map<string, PromptPresetConfig>;

  /** Template configurations (keyed by ID) */
  templates: Map<string, TemplatePresetConfig>;
}

// =============================================================================
// Configuration Defaults
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<NormalizedConfig, 'providers' | 'models' | 'groups' | 'mcpServers' | 'workflows' | 'prompts' | 'templates'> = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  outputFormat: 'text',
};

// =============================================================================
// Configuration File Paths
// =============================================================================

/** Config directory name */
export const CONFIG_DIR_NAME = '.neko';

/** Config file name */
export const CONFIG_FILE_NAME = 'config.json';
