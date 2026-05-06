/**
 * marketplaceStore — Zustand store for Marketplace webview state.
 */

import { create } from 'zustand';
import type {
  AssetCategory,
  AssetType,
  MarketPricing,
  MarketSearchQuery,
  MarketServerInfo,
  MarketSort,
} from '../messages';

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
  category?: AssetCategory;
  kind?: string;
  installState: 'not-installed' | 'installed' | 'update-available' | 'installing';
  installedVersion?: string;
  pricing?: 'free' | 'paid';
  entitlementState?: OwnedItem['state'];
  status?: InstalledStatus;
  largeAsset?: MarketLargeAssetStrategy;
}

export type InstalledStatus =
  | 'active'
  | 'expiring-soon'
  | 'expired'
  | 'incompatible'
  | 'deprecated';

export interface InstalledItem {
  packageId: string;
  name: string;
  version: string;
  type: AssetType;
  category?: AssetCategory;
  kind?: string;
  installedAt: string;
  installedPath: string;
  enabled: boolean;
  requested?: boolean;
  status?: InstalledStatus;
  expiresAt?: number;
  refs?: Record<string, { refCount: number; owners: string[] }>;
  largeAsset?: LargeAssetState;
}

export interface UpdateItem {
  packageId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  blocked?: boolean;
  reason?: string;
  compatibility?: MarketCompatibility;
}

export interface MarketCompatibility {
  nekoSuiteVersion?: string;
  vscodeVersion?: string;
  engineVersion?: string;
  knownIncompatible?: Array<{ reason: string; range: string }>;
  upgradeTo?: { packageId: string; version: string };
}

export interface InstallProgressInfo {
  packageId: string;
  phase: string;
  percent: number;
  error?: string;
}

export interface OwnedItem {
  packageId: string;
  name?: string;
  version?: string;
  type?: AssetType;
  grantedAt: number;
  expiresAt?: number | null;
  source: 'free' | 'purchase' | 'subscription' | 'team' | 'gift';
  state: 'owned-installed' | 'owned-not-installed' | 'expiring' | 'expired' | 'pending';
  installedPackageId?: string;
}

export interface EntitlementCacheState {
  items: OwnedItem[];
  etag?: string;
  lastRefreshedAt?: number;
  isRefreshing: boolean;
}

export interface LargeAssetState {
  state: 'not-owned' | 'owned' | 'manifest-only' | 'proxy' | 'partial' | 'full';
  selectedItems?: string[];
  downloadedItems?: string[];
  selectedVariantId?: string;
  proxyQuality?: string;
  totalSize?: number;
  downloadedSize?: number;
}

export interface MarketLargeAssetStrategy {
  modes: Array<'eager' | 'sparse' | 'proxy' | 'delta' | 'variant'>;
  sparseItems?: Array<{ itemId: string; name: string; size: number; defaultSelected?: boolean }>;
  proxyVariants?: Array<{ qualityTag: string; size: number; default?: boolean }>;
  variants?: Array<{ variantId: string; size: number; recommended?: boolean; minVram?: number }>;
  deltaBase?: { version: string; deltaUrl: string; deltaSize: number };
  totalSize: number;
}

export interface LargeAssetPickerState {
  packageId: string;
  mode: 'variant' | 'sparse' | 'proxy' | 'delta';
  variants?: Array<{ variantId: string; size: number; recommended?: boolean; minVram?: number }>;
  sparseItems?: Array<{ itemId: string; name: string; size: number; defaultSelected?: boolean }>;
  proxyVariants?: Array<{ qualityTag: string; size: number; default?: boolean }>;
  selectedVariantId?: string;
  selectedItems: string[];
  totalSize?: number;
  selectedSize?: number;
  isSupported: boolean;
  isOpen: boolean;
}

// =============================================================================
// Store
// =============================================================================

export type TabType = 'browse' | 'installed' | 'owned' | 'updates';
export type AssetTypeFilter = 'all' | AssetType;

export interface BrowseFilters {
  category: AssetCategory | 'all';
  type: AssetTypeFilter;
  kind?: string;
  pricing: MarketPricing;
  sort: MarketSort;
}

interface MarketplaceState {
  // Navigation
  activeTab: TabType;
  assetTypeFilter: AssetTypeFilter;
  browseFilters: BrowseFilters;
  serverInfo: MarketServerInfo | null;

  // Browse
  searchText: string;
  featured: MarketItem[];
  searchResults: MarketItem[];
  selectedPackage: MarketItem | null;
  searchTotal: number;
  isSearching: boolean;

  // Installed
  installed: InstalledItem[];

  // Owned
  entitlements: EntitlementCacheState;

  // Updates
  updates: UpdateItem[];

  // Large asset picker
  largeAssetPicker: LargeAssetPickerState | null;

  // Install progress (per packageId)
  installProgress: Map<string, InstallProgressInfo>;

  // Error (dismissible, i18n key + optional message param)
  error: { i18nKey: string; message?: string } | null;

  // Actions — navigation
  setActiveTab: (tab: TabType) => void;
  setAssetTypeFilter: (filter: AssetTypeFilter) => void;
  setBrowseFilters: (filters: Partial<BrowseFilters>) => void;
  setServerInfo: (info: MarketServerInfo | null) => void;

  // Actions — browse
  setSearchText: (text: string) => void;
  setSearching: (loading: boolean) => void;
  setFeatured: (items: MarketItem[]) => void;
  setSearchResults: (items: MarketItem[], total: number) => void;
  setSelectedPackage: (item: MarketItem | null) => void;

  // Actions — installed
  setInstalled: (items: InstalledItem[]) => void;

  // Actions — owned
  setEntitlements: (items: OwnedItem[], etag?: string) => void;
  setEntitlementsRefreshing: (loading: boolean) => void;

  // Actions — updates
  setUpdates: (items: UpdateItem[]) => void;

  // Actions — large assets
  openLargeAssetPicker: (state: LargeAssetPickerState) => void;
  updateLargeAssetPicker: (state: Partial<LargeAssetPickerState>) => void;
  closeLargeAssetPicker: () => void;

  // Actions — progress
  setInstallProgress: (progress: InstallProgressInfo) => void;
  clearInstallProgress: (packageId: string) => void;

  // Actions — error
  setError: (error: { i18nKey: string; message?: string } | null) => void;

  // Selectors/helpers
  buildBrowseQuery: () => MarketSearchQuery;
}

export function buildBrowseQueryFromState(
  searchText: string,
  filters: BrowseFilters,
): MarketSearchQuery {
  const query: MarketSearchQuery = {
    text: searchText || undefined,
    sort: filters.sort,
    order: 'desc',
  };

  if (filters.category !== 'all') {
    query.category = filters.category;
  }
  if (filters.type !== 'all') {
    query.types = [filters.type];
  }
  if (filters.kind) {
    query.semantic = { kind: filters.kind };
  }
  if (filters.pricing !== 'all') {
    query.pricing = filters.pricing;
  }

  return query;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  // Navigation
  activeTab: 'browse',
  assetTypeFilter: 'all',
  browseFilters: {
    category: 'all',
    type: 'all',
    pricing: 'all',
    sort: 'featured',
  },
  serverInfo: null,

  // Browse
  searchText: '',
  featured: [],
  searchResults: [],
  selectedPackage: null,
  searchTotal: 0,
  isSearching: false,

  // Installed
  installed: [],

  // Owned
  entitlements: {
    items: [],
    isRefreshing: false,
  },

  // Updates
  updates: [],

  // Large assets
  largeAssetPicker: null,

  // Progress
  installProgress: new Map(),

  // Error
  error: null,

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),

  setAssetTypeFilter: (filter) =>
    set((state) => ({
      assetTypeFilter: filter,
      browseFilters: { ...state.browseFilters, type: filter },
    })),

  setBrowseFilters: (filters) =>
    set((state) => ({
      browseFilters: { ...state.browseFilters, ...filters },
      assetTypeFilter: filters.type ?? state.assetTypeFilter,
    })),

  setServerInfo: (info) => set({ serverInfo: info }),

  setSearchText: (text) => set({ searchText: text }),

  setSearching: (loading) => set({ isSearching: loading }),

  setFeatured: (items) => set({ featured: items }),

  setSearchResults: (items, total) =>
    set({ searchResults: items, searchTotal: total, isSearching: false }),

  setSelectedPackage: (item) => set({ selectedPackage: item }),

  setInstalled: (items) => set({ installed: items }),

  setEntitlements: (items, etag) =>
    set({
      entitlements: {
        items,
        etag,
        lastRefreshedAt: Date.now(),
        isRefreshing: false,
      },
    }),

  setEntitlementsRefreshing: (loading) =>
    set((state) => ({
      entitlements: { ...state.entitlements, isRefreshing: loading },
    })),

  setUpdates: (items) => set({ updates: items }),

  openLargeAssetPicker: (picker) =>
    set({ largeAssetPicker: normalizeLargeAssetPicker({ ...picker, isOpen: true }) }),

  updateLargeAssetPicker: (picker) =>
    set((state) => ({
      largeAssetPicker: state.largeAssetPicker ? { ...state.largeAssetPicker, ...picker } : null,
    })),

  closeLargeAssetPicker: () => set({ largeAssetPicker: null }),

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

  buildBrowseQuery: () => {
    const state = get();
    return buildBrowseQueryFromState(state.searchText, state.browseFilters);
  },
}));

function normalizeLargeAssetPicker(picker: LargeAssetPickerState): LargeAssetPickerState {
  if (picker.mode !== 'variant' || picker.selectedVariantId || !picker.variants?.length) {
    return picker;
  }
  const selected = picker.variants.find((variant) => variant.recommended) ?? picker.variants[0];
  if (!selected) return picker;
  return {
    ...picker,
    selectedVariantId: selected.variantId,
    selectedSize: selected.size,
  };
}
