/**
 * Webview Types — Re-exports from @neko-agent/types (Single Source of Truth)
 *
 * All shared types are defined in @neko-agent/types.
 * This file provides backward-compatible re-exports so existing webview
 * imports (`from '@/components/types'`) continue to work unchanged.
 */

// Re-export from @neko/shared
export type { MessageAttachment, AttachmentType } from '@neko/shared';

// Re-export all shared agent types
export type {
  // Message protocol
  Message,
  MessageContextReference,
  ToolCall,
  ContentBlock,
  ContentBlockType,
  CodeDiff,
  CompositeBlockData,
  CompositeSection,
  CompositeTemplate,
  MediaRef,
  // Plan
  Plan,
  PlanStep,
  // Phase
  AgentPhase,
  AgentState,
  // Provider
  ConfiguredProvider,
  // Settings
  AIAssistantSettings,
  ShellExecutionMode,
  // UI
  ConversationSummary,
  ConversationKind,
  CharacterDialogueSessionProjection,
  EmbodyCharacterSessionProjection,
  OpenTab,
  TabType,
  PromptMode,
  SessionMode,
  SsoSession,
  SettingsState,
} from '@neko-agent/types';

// Re-export shared config types for convenience
export type {
  MCPServerConfig as ConfiguredMCPServer,
  PromptPresetConfig as ConfiguredPrompt,
  PromptPresetType,
  ChatModelOption,
} from '@neko/shared';

// Re-export VSCodeAPI from shared (Single Source of Truth)
export type { VSCodeAPI } from '@neko/shared/vscode';
