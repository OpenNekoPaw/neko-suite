/**
 * useSkillMarket — Zustand store for Skill Marketplace state.
 *
 * Manages search, installed list, progress, and featured skills.
 */

import { create } from 'zustand';

// =============================================================================
// Types (lightweight copies to avoid cross-package import in webview)
// =============================================================================

export interface MarketSkillItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  icon?: string;
  tags?: string[];
  downloadCount?: number;
  installState: 'not-installed' | 'installed' | 'update-available';
  installedVersion?: string;
}

export interface InstallProgressInfo {
  packageId: string;
  phase: string;
  percent: number;
  error?: string;
}

// =============================================================================
// Store
// =============================================================================

interface SkillMarketState {
  // Tab
  activeTab: 'browse' | 'installed' | 'updates';
  setActiveTab: (tab: 'browse' | 'installed' | 'updates') => void;

  // Search
  searchText: string;
  setSearchText: (text: string) => void;
  searchResults: MarketSkillItem[];
  searchTotal: number;
  isSearching: boolean;

  // Installed
  installedSkills: MarketSkillItem[];

  // Updates
  updates: Array<{ packageId: string; currentVersion: string; latestVersion: string }>;

  // Featured
  featured: MarketSkillItem[];

  // Install progress
  installProgress: Map<string, InstallProgressInfo>;

  // Actions (called when receiving messages from extension)
  setSearchResults: (items: MarketSkillItem[], total: number) => void;
  setSearching: (loading: boolean) => void;
  setInstalledSkills: (skills: MarketSkillItem[]) => void;
  setUpdates: (
    updates: Array<{ packageId: string; currentVersion: string; latestVersion: string }>,
  ) => void;
  setFeatured: (items: MarketSkillItem[]) => void;
  setInstallProgress: (progress: InstallProgressInfo) => void;
  clearInstallProgress: (packageId: string) => void;
}

export const useSkillMarket = create<SkillMarketState>((set) => ({
  // Tab
  activeTab: 'browse',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Search
  searchText: '',
  setSearchText: (text) => set({ searchText: text }),
  searchResults: [],
  searchTotal: 0,
  isSearching: false,

  // Installed
  installedSkills: [],

  // Updates
  updates: [],

  // Featured
  featured: [],

  // Install progress
  installProgress: new Map(),

  // Actions
  setSearchResults: (items, total) =>
    set({ searchResults: items, searchTotal: total, isSearching: false }),
  setSearching: (loading) => set({ isSearching: loading }),
  setInstalledSkills: (skills) => set({ installedSkills: skills }),
  setUpdates: (updates) => set({ updates }),
  setFeatured: (items) => set({ featured: items }),
  setInstallProgress: (progress) =>
    set((state) => {
      const newMap = new Map(state.installProgress);
      if (progress.phase === 'done' || progress.phase === 'error') {
        newMap.delete(progress.packageId);
      } else {
        newMap.set(progress.packageId, progress);
      }
      return { installProgress: newMap };
    }),
  clearInstallProgress: (packageId) =>
    set((state) => {
      const newMap = new Map(state.installProgress);
      newMap.delete(packageId);
      return { installProgress: newMap };
    }),
}));
