/**
 * marketplaceStore — Zustand store for Marketplace webview state.
 */

import { create } from 'zustand';

// =============================================================================
// Domain Types (lightweight, no @neko/shared import in webview)
// =============================================================================

export interface MarketItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
  publisherId?: string;
  version: string;
  type: string;
  icon?: string;
  thumbnail?: string;
  tags?: string[];
  downloadCount?: number;
  rating?: number;
  installState: 'not-installed' | 'installed' | 'update-available';
  installedVersion?: string;
}

export interface InstalledItem {
  packageId: string;
  name: string;
  version: string;
  type: string;
  installedAt: string;
  installedPath: string;
  enabled: boolean;
}

export interface UpdateItem {
  packageId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
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

export type TabType = 'browse' | 'installed' | 'updates';
export type AssetTypeFilter = 'all' | 'skill' | 'shader' | 'model' | 'preset';

interface MarketplaceState {
  // Navigation
  activeTab: TabType;
  assetTypeFilter: AssetTypeFilter;

  // Browse
  searchText: string;
  featured: MarketItem[];
  searchResults: MarketItem[];
  searchTotal: number;
  isSearching: boolean;

  // Installed
  installed: InstalledItem[];

  // Updates
  updates: UpdateItem[];

  // Install progress (per packageId)
  installProgress: Map<string, InstallProgressInfo>;

  // Error (dismissible, i18n key + optional message param)
  error: { i18nKey: string; message?: string } | null;

  // Actions — navigation
  setActiveTab: (tab: TabType) => void;
  setAssetTypeFilter: (filter: AssetTypeFilter) => void;

  // Actions — browse
  setSearchText: (text: string) => void;
  setSearching: (loading: boolean) => void;
  setFeatured: (items: MarketItem[]) => void;
  setSearchResults: (items: MarketItem[], total: number) => void;

  // Actions — installed
  setInstalled: (items: InstalledItem[]) => void;

  // Actions — updates
  setUpdates: (items: UpdateItem[]) => void;

  // Actions — progress
  setInstallProgress: (progress: InstallProgressInfo) => void;
  clearInstallProgress: (packageId: string) => void;

  // Actions — error
  setError: (error: { i18nKey: string; message?: string } | null) => void;
}

export const useMarketplaceStore = create<MarketplaceState>((set) => ({
  // Navigation
  activeTab: 'browse',
  assetTypeFilter: 'all',

  // Browse
  searchText: '',
  featured: [],
  searchResults: [],
  searchTotal: 0,
  isSearching: false,

  // Installed
  installed: [],

  // Updates
  updates: [],

  // Progress
  installProgress: new Map(),

  // Error
  error: null,

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),

  setAssetTypeFilter: (filter) => set({ assetTypeFilter: filter }),

  setSearchText: (text) => set({ searchText: text }),

  setSearching: (loading) => set({ isSearching: loading }),

  setFeatured: (items) => set({ featured: items }),

  setSearchResults: (items, total) =>
    set({ searchResults: items, searchTotal: total, isSearching: false }),

  setInstalled: (items) => set({ installed: items }),

  setUpdates: (items) => set({ updates: items }),

  setInstallProgress: (progress) =>
    set((state) => {
      const map = new Map(state.installProgress);
      if (progress.phase === 'done' || progress.phase === 'error') {
        map.delete(progress.packageId);
      } else {
        map.set(progress.packageId, progress);
      }
      return { installProgress: map };
    }),

  clearInstallProgress: (packageId) =>
    set((state) => {
      const map = new Map(state.installProgress);
      map.delete(packageId);
      return { installProgress: map };
    }),

  setError: (error) => set({ error }),
}));
