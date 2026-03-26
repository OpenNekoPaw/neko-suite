/**
 * @neko-agent/types — Shared type definitions for the neko-agent ecosystem
 *
 * Zero-dependency types package consumed by agent, platform, extension, webview, and cli-tui.
 */

// Message protocol
export type { Message, ToolCall, ContentBlock, ContentBlockType, CodeDiff } from './message';

// Plan
export type { Plan, PlanStep } from './plan';

// Provider
export type { ConfiguredProvider } from './provider';

// Settings
export type { AIAssistantSettings, ShellExecutionMode } from './settings';
export { DEFAULT_SETTINGS } from './settings';

// Agent phase
export type { AgentPhase, AgentState } from './phase';

// UI types
export type {
  ConversationSummary,
  OpenTab,
  TabType,
  PromptMode,
  SessionMode,
  SsoSession,
  SettingsState,
} from './ui';
