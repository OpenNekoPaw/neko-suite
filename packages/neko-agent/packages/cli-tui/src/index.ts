/**
 * @neko/cli — Professional CLI for Neko AI Agent
 *
 * Unified package: Ink-based TUI + core CLI capabilities (config, runner, LLM client).
 * Public API exports for programmatic usage.
 */

// ============================================================================
// Core (migrated from old @neko/cli)
// ============================================================================

// Core Types
export type {
  CLIConfig,
  RunOptions,
  CLIResult,
  ProviderConfig,
} from './core/types';

export { PROVIDERS, DEFAULT_CLI_CONFIG } from './core/types';

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
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
  getGlobalConfigDir,
  getGlobalConfigPath,
  getProjectConfigPath,
} from './core/config';

// Runner
export {
  runAgent,
  runAgentWithContext,
  type AgentRunnerOptions,
  type AgentRunnerWithContextOptions,
} from './core/runner';

// Slash Commands
export {
  isSlashCommand,
  handleSlashCommand,
  parseSlashCommand,
  type SlashCommandResult,
  type SlashCommandContext,
} from './core/slash-commands';

// LLM Client
export {
  createLLMClient,
  type ILLMClient,
  type LLMClientOptions,
  type LLMClientResponse,
  type ToolCall,
} from './core/llm-client';

// LLM Service Adapter
export {
  LLMServiceAdapter,
  createLLMServiceAdapter,
} from './core/llm-service-adapter';

// Formatter
export { formatResult, formatText, formatJson, formatMarkdown } from './core/formatter';

// ============================================================================
// TUI Types
// ============================================================================

export type {
  Message,
  ToolCallState,
  TodoItem,
  AgentStatus,
  ExecutionMode,
  TokenUsage,
  IterationProgress,
  TerminalSize,
  TUIResult,
} from './types';

export type {
  InkColor,
  ColorPair,
  ThemeTokens,
} from './types';

// Stores
export { useConversationStore } from './stores/conversation-store';
export { useAgentStore } from './stores/agent-store';
export { useConfigStore } from './stores/config-store';
export { useUIStore } from './stores/ui-store';

// Theme
export { tokens, TODO_ICONS, TOOL_ICONS, BRAILLE_SPINNER } from './theme';

// Adapters
export { createEventAdapter, type IEventAdapter } from './adapters/event-adapter';

// Components (for custom compositions)
export { App } from './components/App';
export { ChatView } from './components/ChatView/ChatView';
export { StreamingText } from './components/ChatView/StreamingText';
export { MessageItem } from './components/ChatView/MessageItem';
export { InputEditor } from './components/Input/InputEditor';
export { StatusBar } from './components/StatusBar/StatusBar';
export { ToolApprovalPanel } from './components/ToolApproval/ToolApprovalPanel';
export { DiffPreview } from './components/ToolApproval/DiffPreview';
export { CommandPreview } from './components/ToolApproval/CommandPreview';
export { MarkdownRenderer } from './components/Markdown/MarkdownRenderer';
export { CodeBlock } from './components/Markdown/CodeBlock';
export { ThinkingBlock } from './components/ChatView/ThinkingBlock';
export { TodoList } from './components/ChatView/TodoList';
export { TokenUsage as TokenUsageBar } from './components/StatusBar/TokenUsage';

// Shared Components
export { ErrorBoundary } from './components/shared/ErrorBoundary';

// Utils
export { parseMarkdown, parseInline, type MarkdownNode } from './utils/markdown-parser';
export { highlightLine, highlightCode, type HighlightToken } from './utils/syntax-highlight';
export { detectCapabilities, getFallbackChars, type TerminalCapabilities } from './utils/terminal';

// Hooks
export { useAgentSession } from './hooks/useAgentSession';
export { useTimer, formatDuration } from './hooks/useTimer';
export { useKeyboard } from './hooks/useKeyboard';
export { useTerminalSize } from './hooks/useTerminalSize';
export { useSlashCommands } from './hooks/useSlashCommands';
export { SlashCommandMenu, TUI_COMMANDS, type SlashCommandOption } from './components/Input/SlashCommandMenu';
