/**
 * Agent CLI Types
 */

import type { AgentSessionConfig, ExecutionMode, MCPServerConfig } from '@neko/agent';
import type { ExternalResearchConfig } from '@neko/shared';
import type { AgentLlmConfig } from '@neko-agent/types';

export type TuiMediaCategory = 'image' | 'video' | 'audio';
export type TuiPerceptionModels = Partial<Record<TuiMediaCategory, string>>;

/**
 * CLI configuration
 */
export interface CLIConfig {
  /** Provider ID (e.g., 'anthropic', 'cpass', 'my-openai') */
  provider: string;
  /** Provider protocol type for API routing (e.g., 'anthropic', 'openai') */
  providerType: string;
  /** Whether the selected provider requires an API key before execution */
  providerRequiresApiKey: boolean;
  /** Chat model ID */
  model: string;
  /** Explicit provider/model identity for the selected chat model. */
  chatModel?: {
    providerId: string;
    modelId: string;
    providerExpressionProfileId?: string;
    capabilities?: readonly string[];
    contextWindow?: number;
    maxOutputTokens?: number;
  };
  /** Media model IDs (for image/video/audio generation, empty if none) */
  mediaModels: string[];
  /** Default media models by type */
  defaultMediaModels?: {
    image?: string;
    video?: string;
    audio?: string;
  };
  /** Session-only perception model overrides for media understanding. */
  perceptionModels?: TuiPerceptionModels;
  /** API key (from env or config) */
  apiKey?: string;
  /** API base URL (optional) */
  baseUrl?: string;
  /** Max output tokens for response generation */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** Enable verbose output */
  verbose: boolean;
  /** Working directory */
  workDir: string;
  /** MCP server configurations */
  mcpServers: MCPServerConfig[];
  /** Opt-in external research configuration. */
  externalResearch?: ExternalResearchConfig;
  /** Output format */
  outputFormat: 'text' | 'json' | 'markdown';
  /** Session execution and confirmation behavior. */
  executionMode: ExecutionMode;
  /** Extended thinking budget in tokens (0 = disabled, Anthropic/DeepSeek only) */
  thinkingBudget: number;
  /** Runtime LLM parameter presets and advanced values for Agent turns. */
  llmConfig?: AgentLlmConfig;
  /** Session-only context compaction/settings forwarded through shared runtime assembly. */
  contextSettings?: AgentSessionConfig['contextSettings'];
}

/**
 * Default CLI configuration
 */
export const DEFAULT_CLI_CONFIG: CLIConfig = {
  provider: 'anthropic',
  providerType: 'anthropic',
  providerRequiresApiKey: true,
  model: 'claude-sonnet-4-20250514',
  mediaModels: [],
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  workDir: process.cwd(),
  mcpServers: [],
  externalResearch: undefined,
  outputFormat: 'text',
  executionMode: 'ask',
  thinkingBudget: 0,
};
