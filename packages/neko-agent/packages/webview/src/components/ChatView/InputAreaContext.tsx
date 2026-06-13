/**
 * InputAreaContext - Provides global/session-wide configuration via React Context
 *
 * Eliminates prop drilling of 13 configuration props through
 * AIAssistant → ChatView → InputArea (and its sub-components).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ShellExecutionMode, PromptMode, SessionMode } from '@neko-agent/types';
import type { ConversationKind } from '@neko-agent/types';
import type { ChatModelOption } from '@neko/shared';
import type { AgentContextPayload } from '@neko/shared';
import type {
  SlashCommand,
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
  GenCategory,
  GenerationParams,
} from '@/components/ChatView/InputArea/types';
import type { MediaModelSelection } from '@/hooks/useUIState';

export type { MediaModelSelection };
export type MediaCategory = 'image' | 'video' | 'audio';

export interface InputAreaContextValue {
  // Chat Model
  selectedModel: string;
  availableModels: ChatModelOption[];
  onModelSelect: (modelId: string) => void;
  // Media Models (per-category selection)
  mediaModelSelection: MediaModelSelection;
  availableMediaModels: ChatModelOption[];
  onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  // Session mode (top-level workflow routing)
  sessionMode: SessionMode;
  conversationKind?: ConversationKind;
  onSessionModeChange: (mode: SessionMode) => void;
  // Execution mode
  executionMode: ShellExecutionMode;
  onExecutionModeChange: (mode: ShellExecutionMode) => void;
  // Prompt mode
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  // Context compression
  contextTokenCount: number;
  maxContextTokens: number;
  isCompressing: boolean;
  onCompressContext?: () => Promise<void>;
  // Media model call count (per conversation)
  mediaModelCallCount: number;
  // Skills
  skills: SkillSummary[];
  /** Plugin slash commands from external extensions */
  pluginCommands?: PluginSlashCommandDef[];
  onSlashCommand?: (command: SlashCommand) => void;
  onRequestFiles?: (filter: string) => void;
  /** Unified @mention items (files + canvas nodes + characters) — updated after onRequestFiles */
  mentionItems?: MentionItem[];
  /** Called when user selects a non-file @mention item to create a context chip */
  onAddContextChip?: (payload: AgentContextPayload) => void;
  // Agent context chips (attached context from canvas/cut/story)
  contextChips: AgentContextPayload[];
  onRemoveContextChip: (id: string) => void;
  /** Ambient canvas selection — auto-injected from canvas, non-removable. */
  ambientNodes?: Array<{ nodeId: string; type: string; summary: string }>;
  // Generation params (shown in top bar, fed into tool calls)
  genCategory: GenCategory;
  genParams: GenerationParams;
  onGenCategoryChange: (cat: GenCategory) => void;
  onGenParamsChange: (partial: Partial<GenerationParams>) => void;
}

const InputAreaContext = createContext<InputAreaContextValue | null>(null);

export function InputAreaProvider({
  children,
  ...value
}: InputAreaContextValue & { children: ReactNode }) {
  const memoized = useMemo<InputAreaContextValue>(
    () => ({
      selectedModel: value.selectedModel,
      availableModels: value.availableModels,
      onModelSelect: value.onModelSelect,
      mediaModelSelection: value.mediaModelSelection,
      availableMediaModels: value.availableMediaModels,
      onMediaModelSelect: value.onMediaModelSelect,
      sessionMode: value.sessionMode,
      conversationKind: value.conversationKind,
      onSessionModeChange: value.onSessionModeChange,
      executionMode: value.executionMode,
      onExecutionModeChange: value.onExecutionModeChange,
      promptMode: value.promptMode,
      onPromptModeChange: value.onPromptModeChange,
      contextTokenCount: value.contextTokenCount,
      maxContextTokens: value.maxContextTokens,
      isCompressing: value.isCompressing,
      onCompressContext: value.onCompressContext,
      mediaModelCallCount: value.mediaModelCallCount,
      skills: value.skills,
      pluginCommands: value.pluginCommands,
      onSlashCommand: value.onSlashCommand,
      onRequestFiles: value.onRequestFiles,
      mentionItems: value.mentionItems,
      onAddContextChip: value.onAddContextChip,
      contextChips: value.contextChips,
      onRemoveContextChip: value.onRemoveContextChip,
      ambientNodes: value.ambientNodes,
      genCategory: value.genCategory,
      genParams: value.genParams,
      onGenCategoryChange: value.onGenCategoryChange,
      onGenParamsChange: value.onGenParamsChange,
    }),
    [
      value.selectedModel,
      value.availableModels,
      value.onModelSelect,
      value.mediaModelSelection,
      value.availableMediaModels,
      value.onMediaModelSelect,
      value.sessionMode,
      value.conversationKind,
      value.onSessionModeChange,
      value.executionMode,
      value.onExecutionModeChange,
      value.promptMode,
      value.onPromptModeChange,
      value.contextTokenCount,
      value.maxContextTokens,
      value.isCompressing,
      value.onCompressContext,
      value.mediaModelCallCount,
      value.skills,
      value.pluginCommands,
      value.onSlashCommand,
      value.onRequestFiles,
      value.mentionItems,
      value.onAddContextChip,
      value.contextChips,
      value.onRemoveContextChip,
      value.ambientNodes,
      value.genCategory,
      value.genParams,
      value.onGenCategoryChange,
      value.onGenParamsChange,
    ],
  );

  return <InputAreaContext.Provider value={memoized}>{children}</InputAreaContext.Provider>;
}

export function useInputAreaContext(): InputAreaContextValue {
  const ctx = useContext(InputAreaContext);
  if (!ctx) {
    throw new Error('useInputAreaContext must be used within an InputAreaProvider');
  }
  return ctx;
}
