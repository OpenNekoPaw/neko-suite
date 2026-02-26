/**
 * @neko/cli - CLI for Neko Suite AI Agent
 *
 * This package provides a command-line interface for running the Neko Suite AI Agent
 * standalone, without requiring the VSCode extension.
 *
 * Features:
 * - Run agent with prompts from command line
 * - Interactive mode for conversational interaction
 * - MCP server integration
 * - Skill system support
 * - Multiple LLM provider support (Anthropic, OpenAI, DeepSeek)
 *
 * Usage:
 *   npx @neko/cli run "your prompt"
 *   npx @neko/cli interactive
 */

// Types
export type {
  CLIConfig,
  RunOptions,
  CLIResult,
  ProviderConfig,
} from './types';

export { PROVIDERS, DEFAULT_CLI_CONFIG } from './types';

// Config
export {
  loadConfig,
  saveGlobalConfig,
  saveUserConfig,
  saveWorkspaceConfig,
  setProviderConfig,
  setProviderApiKey,
  setProviderDefaultModel,
  addProviderModel,
  getProviderModels,
  validateConfig,
  getProviderConfig,
  listProviders,
  listConfiguredProviders,
  getConfigLocations,
  // Path helpers
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  // Legacy aliases
  getGlobalConfigDir,
  getGlobalConfigPath,
  getProjectConfigPath,
} from './config';

// Runner
export {
  runAgent,
  runAgentWithContext,
  runInteractive,
  type AgentRunnerOptions,
  type AgentRunnerWithContextOptions,
} from './runner';

// Slash Commands
export {
  isSlashCommand,
  handleSlashCommand,
  parseSlashCommand,
  type SlashCommandResult,
  type SlashCommandContext,
} from './slash-commands';

// LLM Client
export {
  createLLMClient,
  type ILLMClient,
  type LLMClientOptions,
  type LLMClientResponse,
  type ToolCall,
} from './llm-client';

// LLM Service Adapter
export {
  LLMServiceAdapter,
  createLLMServiceAdapter,
} from './llm-service-adapter';

// Formatter
export { formatResult, formatText, formatJson, formatMarkdown } from './formatter';
