/**
 * Asset Library Types
 *
 * UI-specific types for the asset library component.
 */

import type {
  AssetEntity,
  AssetVariant,
  EntityCategory,
  ViewAngle,
  ExpressionState,
  ActionState,
} from '@neko/shared';

// =============================================================================
// View State
// =============================================================================

/** View mode for the asset library */
export type AssetViewMode = 'grid' | 'list';

/** Sort options */
export type AssetSortBy = 'name' | 'createdAt' | 'updatedAt' | 'usageCount';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

// =============================================================================
// Variant Attribute Filter
// =============================================================================

/** Filter state for variant attributes */
export interface VariantAttributeFilter {
  /** View angles to include */
  views?: ViewAngle[];
  /** Expression states to include */
  expressions?: ExpressionState[];
  /** Action states to include */
  actions?: ActionState[];
  /** Outfit names to include */
  outfits?: string[];
}

// =============================================================================
// Filter State
// =============================================================================

export interface AssetFilterState {
  /** Active category filter */
  category: EntityCategory | null;
  /** Search keyword */
  keyword: string;
  /** Tag filters */
  tags: string[];
  /** Sort field */
  sortBy: AssetSortBy;
  /** Sort direction */
  sortDirection: SortDirection;
  /** Variant attribute filter */
  variantAttributes?: VariantAttributeFilter;
}

export function createDefaultFilter(): AssetFilterState {
  return {
    category: null,
    keyword: '',
    tags: [],
    sortBy: 'updatedAt',
    sortDirection: 'desc',
  };
}

// =============================================================================
// Selection State
// =============================================================================

/** Selection item - can be entity or variant */
export interface SelectionItem {
  type: 'entity' | 'variant';
  entityId: string;
  variantId?: string;
}

export interface AssetSelectionState {
  /** Selected items (entities or variants) - supports multi-selection */
  selectedItems: SelectionItem[];
  /** Last selected item for keyboard navigation */
  lastSelectedItem: SelectionItem | null;
  /** Selection anchor for Shift+click range selection */
  selectionAnchor: SelectionItem | null;
  /** Expanded entity IDs (showing variants) */
  expandedEntityIds: Set<string>;
}

export function createDefaultSelection(): AssetSelectionState {
  return {
    selectedItems: [],
    lastSelectedItem: null,
    selectionAnchor: null,
    expandedEntityIds: new Set(),
  };
}

/** Check if an entity is selected */
export function isEntitySelected(selection: AssetSelectionState, entityId: string): boolean {
  return selection.selectedItems.some(
    (item) => item.type === 'entity' && item.entityId === entityId,
  );
}

/** Check if a variant is selected */
export function isVariantSelected(
  selection: AssetSelectionState,
  entityId: string,
  variantId: string,
): boolean {
  return selection.selectedItems.some(
    (item) => item.type === 'variant' && item.entityId === entityId && item.variantId === variantId,
  );
}

/** Get selected variants from selection state */
export function getSelectedVariants(selection: AssetSelectionState): Array<{
  entityId: string;
  variantId: string;
}> {
  return selection.selectedItems
    .filter(
      (item): item is SelectionItem & { variantId: string } =>
        item.type === 'variant' && !!item.variantId,
    )
    .map((item) => ({ entityId: item.entityId, variantId: item.variantId }));
}

// =============================================================================
// Component Props
// =============================================================================

export interface AssetPanelProps {
  /** Called when an asset is dropped onto timeline */
  onAssetDrop?: (entity: AssetEntity, variant: AssetVariant) => void;
  /** Called when an asset is double-clicked */
  onAssetDoubleClick?: (entity: AssetEntity, variant: AssetVariant) => void;
  /** Whether the panel is disabled */
  disabled?: boolean;
}

export interface EntityCardProps {
  entity: AssetEntity;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

export interface VariantCardProps {
  variant: AssetVariant;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDoubleClick: () => void;
}

export interface CategoryTabsProps {
  activeCategory: EntityCategory | null;
  onCategoryChange: (category: EntityCategory | null) => void;
}

export interface AssetFilterBarProps {
  filter: AssetFilterState;
  onFilterChange: (filter: AssetFilterState) => void;
  availableTags: Array<{ tag: string; count: number }>;
}

export interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (files: File[]) => void;
}

// =============================================================================
// Category Info
// =============================================================================

export interface CategoryInfo {
  id: EntityCategory;
  labelKey: string;
  icon: string;
}

export const CATEGORY_INFO: CategoryInfo[] = [
  { id: 'character', labelKey: 'assetLibrary.category.character', icon: '👤' },
  { id: 'creature', labelKey: 'assetLibrary.category.creature', icon: '🐾' },
  { id: 'object', labelKey: 'assetLibrary.category.object', icon: '📦' },
  { id: 'vehicle', labelKey: 'assetLibrary.category.vehicle', icon: '🚗' },
  { id: 'environment', labelKey: 'assetLibrary.category.environment', icon: '🏞️' },
  { id: 'effect', labelKey: 'assetLibrary.category.effect', icon: '✨' },
  { id: 'ui', labelKey: 'assetLibrary.category.ui', icon: '🖼️' },
  { id: 'audio', labelKey: 'assetLibrary.category.audio', icon: '🎵' },
];

export function getCategoryInfo(category: EntityCategory): CategoryInfo {
  return CATEGORY_INFO.find((c) => c.id === category) ?? CATEGORY_INFO[2]; // default to object
}
