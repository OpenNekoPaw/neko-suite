/**
 * @neko/cli — Professional CLI for Neko AI Agent
 *
 * Unified package: Ink-based TUI + core CLI capabilities (config, runner).
 * Public API exports for programmatic usage.
 */

// ============================================================================
// Core
// ============================================================================

// Core Types
export type { CLIConfig, RunOptions, CLIResult } from './core/types';

export { DEFAULT_CLI_CONFIG } from './core/types';

// Config
export {
  loadConfig,
  validateConfig,
  getProviderModels,
  listProviders,
  listConfiguredProviders,
  getApiKeyFromEnv,
  createConfigManager,
  type ProviderInfo,
  getConfigLocations,
  getUserConfigDir,
  getUserConfigPath,
  getWorkspaceConfigDir,
  getWorkspaceConfigPath,
} from './core/config';

// Platform Bootstrap
export {
  createCLIPlatform,
  type CLIPlatformOptions,
  type CLIPlatformResult,
} from './core/platform-bootstrap';

// Runner
export {
  runAgent,
  runAgentWithContext,
  runInteractive,
  type AgentRunnerOptions,
  type AgentRunnerWithContextOptions,
} from './core/runner';

export {
  createTuiCapabilityLoader,
  type TuiCapabilityLoader,
  type TuiCapabilityLoaderOptions,
  type TuiCapabilityLoaderResult,
} from './core/tui-capability-loader';

// Slash Commands
export {
  isSlashCommand,
  handleSlashCommand,
  parseSlashCommand,
  type SlashCommandResult,
  type SlashCommandContext,
} from './core/slash-commands';

// Formatter
export { formatResult, formatText, formatJson, formatMarkdown } from './core/formatter';

export {
  CLI_RUN_RESULT_SCHEMA,
  createCliRunResultArtifact,
  writeCliRunResultArtifact,
  type CliRunResultArtifact,
  type CliRunResultConfigSnapshot,
} from './core/run-result';

export {
  TUI_REAL_API_SUITE_SCHEMA,
  TUI_REAL_API_SUITE_RUN_SCHEMA,
  createDefaultTuiRealApiSuiteManifest,
  loadTuiRealApiSuiteManifest,
  parseTuiRealApiSuiteManifest,
  runTuiRealApiSuite,
  evaluateTuiRealApiCase,
  formatTuiRealApiSuiteReport,
  type TuiRealApiAiSummaryOptions,
  type TuiRealApiCase,
  type TuiRealApiCaseExecution,
  type TuiRealApiCaseResult,
  type TuiRealApiCaseVerdict,
  type TuiRealApiCheck,
  type TuiRealApiCheckResult,
  type TuiRealApiSuiteManifest,
  type TuiRealApiSuiteResult,
} from './core/real-api-suite';

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

export type { InkColor, ColorPair, ThemeTokens } from './types';

// Stores
export { useConversationStore } from './stores/conversation-store';
export { useAgentStore } from './stores/agent-store';
export { useConfigStore } from './stores/config-store';
export { useUIStore } from './stores/ui-store';

// Theme
export { INK_BRAILLE_SPINNER, INK_TODO_ICONS, INK_TOOL_ICONS, tokens } from './theme';

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
export {
  SlashCommandMenu,
  TUI_COMMANDS,
  type SlashCommandOption,
} from './components/Input/SlashCommandMenu';
