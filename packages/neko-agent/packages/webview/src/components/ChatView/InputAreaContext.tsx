/**
 * InputAreaContext - Provides global/session-wide configuration via React Context
 *
 * Eliminates prop drilling of 13 configuration props through
 * AIAssistant → ChatView → InputArea (and its sub-components).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ShellExecutionMode, PromptMode, SessionMode } from '@/components/types';
import type { ChatModelOption } from '@neko/shared';
import type { SlashCommand, SkillSummary } from '@/components/ChatView/InputArea/types';
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
  onSessionModeChange: (mode: SessionMode) => void;
  // Execution mode
  executionMode: ShellExecutionMode;
  onExecutionModeChange: (mode: ShellExecutionMode) => void;
  // Prompt mode
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  // Context compression
  contextTokenCount: number;
  isCompressing: boolean;
  onCompressContext?: () => Promise<void>;
  // Media model call count (per conversation)
  mediaModelCallCount: number;
  // Skills
  skills: SkillSummary[];
  onSlashCommand?: (command: SlashCommand) => void;
  onRequestFiles?: (filter: string) => void;
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
      onSessionModeChange: value.onSessionModeChange,
      executionMode: value.executionMode,
      onExecutionModeChange: value.onExecutionModeChange,
      promptMode: value.promptMode,
      onPromptModeChange: value.onPromptModeChange,
      contextTokenCount: value.contextTokenCount,
      isCompressing: value.isCompressing,
      onCompressContext: value.onCompressContext,
      mediaModelCallCount: value.mediaModelCallCount,
      skills: value.skills,
      onSlashCommand: value.onSlashCommand,
      onRequestFiles: value.onRequestFiles,
    }),
    [
      value.selectedModel,
      value.availableModels,
      value.onModelSelect,
      value.mediaModelSelection,
      value.availableMediaModels,
      value.onMediaModelSelect,
      value.sessionMode,
      value.onSessionModeChange,
      value.executionMode,
      value.onExecutionModeChange,
      value.promptMode,
      value.onPromptModeChange,
      value.contextTokenCount,
      value.isCompressing,
      value.onCompressContext,
      value.mediaModelCallCount,
      value.skills,
      value.onSlashCommand,
      value.onRequestFiles,
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
