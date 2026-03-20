/**
 * Unified Configuration Types
 *
 * Shared configuration format for agent-cli and platform.
 * File locations:
 * - User config: ~/.neko/config.json
 * - Workspace config: .neko/config.json
 */

import type { ProviderConfig, ModelConfig, MCPServerConfig } from '../types/config';

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

  /** Default media models by type */
  defaultMediaModels?: {
    image?: string;
    video?: string;
    audio?: string;
    music?: string;
  };

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

  /** Extended thinking budget in tokens (0 = disabled, Anthropic/DeepSeek only) */
  thinkingBudget?: number;

  // ==========================================================================
  // Extension-specific Settings
  // ==========================================================================

  /** Custom system prompt override */
  customSystemPrompt?: string;

  /** Auto execute tools without confirmation */
  autoExecuteTools?: boolean;

  /** Enable streaming responses */
  streamResponses?: boolean;

  /** Show tool call details in UI */
  showToolCalls?: boolean;

  /** Execution mode: plan (read-only), ask (confirm tools), auto (full auto) */
  executionMode?: 'plan' | 'ask' | 'auto';

  // ==========================================================================
  // Resource Configuration (Array Format)
  // ==========================================================================

  /** Provider configurations */
  providers?: ProviderConfig[];

  /** Model configurations */
  models?: ModelConfig[];

  /** MCP server configurations */
  mcpServers?: MCPServerConfig[];

  // ==========================================================================
  // Override Configuration
  // ==========================================================================

  /** Provider overrides (keyed by provider ID) */
  providerOverrides?: Record<string, Partial<ProviderConfig>>;

  /** Model overrides (keyed by model ID) */
  modelOverrides?: Record<string, Partial<ModelConfig>>;

  /** MCP server overrides (keyed by server ID) */
  mcpServerOverrides?: Record<string, Partial<MCPServerConfig>>;

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

  /** MCP server configurations (keyed by ID) */
  mcpServers: Map<string, MCPServerConfig>;
}

// =============================================================================
// Configuration Defaults
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<NormalizedConfig, 'providers' | 'models' | 'mcpServers'> = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  outputFormat: 'text',
};

/**
 * Default values for extension-specific settings and thinkingBudget.
 * Kept separate from NormalizedConfig to avoid polluting CLI-only types.
 */
export const DEFAULT_EXTENSION_CONFIG = {
  thinkingBudget: 10000,
  customSystemPrompt: '',
  autoExecuteTools: true,
  streamResponses: true,
  showToolCalls: true,
  executionMode: 'ask' as const,
} satisfies Partial<UnifiedConfig>;

// =============================================================================
// Configuration File Paths
// =============================================================================

/** Config directory name */
export const CONFIG_DIR_NAME = '.neko';

/** Config file name */
export const CONFIG_FILE_NAME = 'config.json';
