/**
 * useConfigState Hook
 *
 * Manages configuration-related state for the AIAssistant component.
 */

import { useState, useCallback } from 'react';
import type { SettingsState, ShellExecutionMode, PromptMode } from '@/components/types';

/**
 * Project file info
 */
export interface ProjectFileInfo {
  path: string;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
}

/**
 * Default settings state
 */
export const DEFAULT_SETTINGS: SettingsState = {
  providers: [],
  configuredProviders: [],
  providerTemplates: [],
  configuredModels: [],
  configuredPrompts: [],
  configuredAgents: [],
  selectedPromptId: 'default',
  selectedAgentId: 'default',
  configuredMCPServers: [],
  configuredSkills: [],
  configuredCommands: [],
  configuredHooks: [],
  configuredToolSkills: [],
  selectedProviderId: null,
  selectedModelId: null,
  systemPrompt: '',
  autoExecuteTools: true,
  streamResponses: true,
  showToolCalls: true,
  temperature: 0.7,
  maxTokens: 4096,
  executionMode: 'ask' as ShellExecutionMode,
  promptMode: 'default' as PromptMode,
  chatModelOptions: [],
  ssoSession: null,
};

/**
 * Config state shape
 */
export interface ConfigState {
  settings: SettingsState;
  projectFiles: ProjectFileInfo[];
}

/**
 * Config state actions
 */
export interface ConfigStateActions {
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  updateSettings: (updates: Partial<SettingsState>) => void;
  resetSettings: () => void;
}

/**
 * useConfigState return type
 */
export interface UseConfigStateReturn extends ConfigState, ConfigStateActions {}

/**
 * Hook for managing configuration state
 */
export function useConfigState(initialSettings?: Partial<SettingsState>): UseConfigStateReturn {
  const [settings, setSettings] = useState<SettingsState>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });
  const [projectFiles, setProjectFiles] = useState<ProjectFileInfo[]>([]);

  // Helper: partial update settings
  const updateSettings = useCallback((updates: Partial<SettingsState>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // Helper: reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    // State
    settings,
    projectFiles,
    // Actions
    setSettings,
    setProjectFiles,
    updateSettings,
    resetSettings,
  };
}
