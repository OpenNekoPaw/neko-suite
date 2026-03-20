/**
 * useUIState Hook
 *
 * Manages UI-related state for the AIAssistant component.
 */

import { useState, useCallback } from 'react';
import type { TabType } from '@/components/types';

/**
 * UI state shape
 */
export interface UIState {
  activeTab: TabType;
  inputValue: string;
  selectedModel: string;
  selectedMediaModel: string;
}

/**
 * UI state actions
 */
export interface UIStateActions {
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  setSelectedMediaModel: React.Dispatch<React.SetStateAction<string>>;
  clearInput: () => void;
}

/**
 * useUIState return type
 */
export interface UseUIStateReturn extends UIState, UIStateActions {}

/**
 * Default UI state
 */
const DEFAULT_UI_STATE: UIState = {
  activeTab: 'chat',
  inputValue: '',
  selectedModel: 'auto',
  selectedMediaModel: 'none',
};

/**
 * Hook for managing UI state
 */
export function useUIState(initialState?: Partial<UIState>): UseUIStateReturn {
  const [activeTab, setActiveTab] = useState<TabType>(
    initialState?.activeTab ?? DEFAULT_UI_STATE.activeTab,
  );
  const [inputValue, setInputValue] = useState(
    initialState?.inputValue ?? DEFAULT_UI_STATE.inputValue,
  );
  const [selectedModel, setSelectedModel] = useState(
    initialState?.selectedModel ?? DEFAULT_UI_STATE.selectedModel,
  );
  const [selectedMediaModel, setSelectedMediaModel] = useState(
    initialState?.selectedMediaModel ?? DEFAULT_UI_STATE.selectedMediaModel,
  );

  const clearInput = useCallback(() => {
    setInputValue('');
  }, []);

  return {
    // State
    activeTab,
    inputValue,
    selectedModel,
    selectedMediaModel,
    // Actions
    setActiveTab,
    setInputValue,
    setSelectedModel,
    setSelectedMediaModel,
    clearInput,
  };
}
