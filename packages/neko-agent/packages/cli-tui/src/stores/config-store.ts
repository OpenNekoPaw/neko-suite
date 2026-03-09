/**
 * Config Store
 *
 * Bridges CLIConfig from @neko/cli into reactive Zustand state.
 * Delegates all loading/saving to @neko/cli/config.
 */

import { create } from 'zustand';
import type { CLIConfig } from '../core/types';
import { DEFAULT_CLI_CONFIG } from '../core/types';

export interface ConfigSlice {
  readonly config: CLIConfig;

  setConfig: (updates: Partial<CLIConfig>) => void;
  replaceConfig: (config: CLIConfig) => void;
}

export const useConfigStore = create<ConfigSlice>((set) => ({
  config: DEFAULT_CLI_CONFIG,

  setConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates },
    }));
  },

  replaceConfig: (config) => {
    set({ config });
  },
}));
