/**
 * Agent CLI Types
 */

import type { AgentResult, MCPServerConfig } from '@neko/agent';
import type { AgentLlmConfig } from '@neko-agent/types';

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
  /** Skills directory */
  skillsDir?: string;
  /** Output format */
  outputFormat: 'text' | 'json' | 'markdown';
  /** Extended thinking budget in tokens (0 = disabled, Anthropic/DeepSeek only) */
  thinkingBudget: number;
  /** Runtime LLM parameter presets and advanced values for Agent turns. */
  llmConfig?: AgentLlmConfig;
  /** Original defaultModel value that was not found in models list (triggers model switch UI) */
  modelNotFound?: string;
}

/**
 * CLI run options
 */
export interface RunOptions {
  /** The prompt/task to execute */
  prompt: string;
  /** Interactive mode */
  interactive: boolean;
  /** Stream output */
  stream: boolean;
  /** Max iterations */
  maxIterations: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Input file (read prompt from file) */
  inputFile?: string;
  /** Output file (write result to file) */
  outputFile?: string;
}

/**
 * CLI result
 */
export interface CLIResult {
  success: boolean;
  output?: string;
  error?: string;
  agentResult?: AgentResult;
  duration: number;
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
  outputFormat: 'text',
  thinkingBudget: 0,
};
