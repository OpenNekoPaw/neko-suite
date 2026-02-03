/**
 * Agent CLI Types
 */

import type { AgentConfig, AgentResult, MCPServerConfig } from '@neko/agent';

/**
 * CLI configuration
 */
export interface CLIConfig {
  /** API provider (anthropic, openai, etc.) */
  provider: string;
  /** Model ID */
  model: string;
  /** API key (from env or config) */
  apiKey?: string;
  /** API base URL (optional) */
  baseUrl?: string;
  /** Max tokens for response */
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
 * Provider configuration
 */
export interface ProviderConfig {
  id: string;
  name: string;
  envKey: string;
  defaultModel: string;
  models: string[];
  baseUrl?: string;
}

/**
 * Default provider configurations
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    baseUrl: 'https://api.deepseek.com',
  },
};

/**
 * Default CLI configuration
 */
export const DEFAULT_CLI_CONFIG: CLIConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  workDir: process.cwd(),
  mcpServers: [],
  outputFormat: 'text',
};
