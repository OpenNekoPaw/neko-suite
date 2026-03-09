/**
 * Asset Selection Hook
 *
 * Manages multi-selection state for the asset library.
 * Supports Ctrl/Cmd + click for toggle selection and Shift + click for range selection.
 */

import { useCallback, useMemo } from 'react';
import type { AssetEntity } from '@neko/shared';
import type { AssetSelectionState, SelectionItem } from './types';
import { isEntitySelected, isVariantSelected } from './types';

export interface UseAssetSelectionOptions {
  entities: AssetEntity[];
  selection: AssetSelectionState;
  setSelection: (
    selection: AssetSelectionState | ((prev: AssetSelectionState) => AssetSelectionState),
  ) => void;
}

export interface UseAssetSelectionReturn {
  /** Handle entity click with modifier key support */
  handleEntityClick: (entityId: string, e: React.MouseEvent) => void;
  /** Handle variant click with modifier key support */
  handleVariantClick: (entityId: string, variantId: string, e: React.MouseEvent) => void;
  /** Check if an entity is selected */
  isEntitySelected: (entityId: string) => boolean;
  /** Check if a variant is selected */
  isVariantSelected: (entityId: string, variantId: string) => boolean;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select all visible items */
  selectAll: () => void;
  /** Get count of selected items */
  selectedCount: number;
}

export function useAssetSelection({
  entities,
  selection,
  setSelection,
}: UseAssetSelectionOptions): UseAssetSelectionReturn {
  /**
   * Get flat list of all selectable items in order (for range selection)
   */
  const getAllSelectableItems = useCallback((): SelectionItem[] => {
    const items: SelectionItem[] = [];
    for (const entity of entities) {
      items.push({ type: 'entity', entityId: entity.id });
      // Include variants if entity is expanded
      if (selection.expandedEntityIds.has(entity.id)) {
        for (const variant of entity.variants) {
          items.push({ type: 'variant', entityId: entity.id, variantId: variant.id });
        }
      }
    }
    return items;
  }, [entities, selection.expandedEntityIds]);

  /**
   * Find index of an item in the selectable items list
   */
  const findItemIndex = useCallback((items: SelectionItem[], item: SelectionItem): number => {
    return items.findIndex(
      (i) => i.type === item.type && i.entityId === item.entityId && i.variantId === item.variantId,
    );
  }, []);

  /**
   * Handle click on entity
   */
  const handleEntityClick = useCallback(
    (entityId: string, e: React.MouseEvent) => {
      const item: SelectionItem = { type: 'entity', entityId };

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd + Click: Toggle selection
        const isSelected = isEntitySelected(selection, entityId);
        setSelection((prev) => ({
          ...prev,
          selectedItems: isSelected
            ? prev.selectedItems.filter((s) => !(s.type === 'entity' && s.entityId === entityId))
            : [...prev.selectedItems, item],
          lastSelectedItem: item,
          selectionAnchor: prev.selectionAnchor ?? item,
        }));
      } else if (e.shiftKey && selection.selectionAnchor) {
        // Shift + Click: Range selection
        const allItems = getAllSelectableItems();
        const anchorIndex = findItemIndex(allItems, selection.selectionAnchor);
        const currentIndex = allItems.findIndex(
          (i) => i.type === 'entity' && i.entityId === entityId,
        );

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(anchorIndex, currentIndex);
          const end = Math.max(anchorIndex, currentIndex);
          const rangeItems = allItems.slice(start, end + 1);
          setSelection((prev) => ({
            ...prev,
            selectedItems: rangeItems,
            lastSelectedItem: item,
          }));
        }
      } else {
        // Normal click: Single selection
        setSelection((prev) => ({
          ...prev,
          selectedItems: [item],
          lastSelectedItem: item,
          selectionAnchor: item,
        }));
      }
    },
    [selection, setSelection, getAllSelectableItems, findItemIndex],
  );

  /**
   * Handle click on variant
   */
  const handleVariantClick = useCallback(
    (entityId: string, variantId: string, e: React.MouseEvent) => {
      const item: SelectionItem = { type: 'variant', entityId, variantId };

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd + Click: Toggle selection
        const isSelected = isVariantSelected(selection, entityId, variantId);
        setSelection((prev) => ({
          ...prev,
          selectedItems: isSelected
            ? prev.selectedItems.filter(
                (s) =>
                  !(s.type === 'variant' && s.entityId === entityId && s.variantId === variantId),
              )
            : [...prev.selectedItems, item],
          lastSelectedItem: item,
          selectionAnchor: prev.selectionAnchor ?? item,
        }));
      } else if (e.shiftKey && selection.selectionAnchor) {
        // Shift + Click: Range selection
        const allItems = getAllSelectableItems();
        const anchorIndex = findItemIndex(allItems, selection.selectionAnchor);
        const currentIndex = allItems.findIndex(
          (i) => i.type === 'variant' && i.entityId === entityId && i.variantId === variantId,
        );

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(anchorIndex, currentIndex);
          const end = Math.max(anchorIndex, currentIndex);
          const rangeItems = allItems.slice(start, end + 1);
          setSelection((prev) => ({
            ...prev,
            selectedItems: rangeItems,
            lastSelectedItem: item,
          }));
        }
      } else {
        // Normal click: Single selection
        setSelection((prev) => ({
          ...prev,
          selectedItems: [item],
          lastSelectedItem: item,
          selectionAnchor: item,
        }));
      }
    },
    [selection, setSelection, getAllSelectableItems, findItemIndex],
  );

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelection((prev) => ({
      ...prev,
      selectedItems: [],
      lastSelectedItem: null,
      selectionAnchor: null,
    }));
  }, [setSelection]);

  /**
   * Select all visible items
   */
  const selectAll = useCallback(() => {
    const allItems = getAllSelectableItems();
    if (allItems.length === 0) return;

    setSelection((prev) => ({
      ...prev,
      selectedItems: allItems,
      lastSelectedItem: allItems[allItems.length - 1] ?? null,
      selectionAnchor: allItems[0] ?? null,
    }));
  }, [getAllSelectableItems, setSelection]);

  /**
   * Check if an entity is selected
   */
  const checkEntitySelected = useCallback(
    (entityId: string): boolean => {
      return isEntitySelected(selection, entityId);
    },
    [selection],
  );

  /**
   * Check if a variant is selected
   */
  const checkVariantSelected = useCallback(
    (entityId: string, variantId: string): boolean => {
      return isVariantSelected(selection, entityId, variantId);
    },
    [selection],
  );

  /**
   * Selected item count
   */
  const selectedCount = useMemo(() => {
    return selection.selectedItems.length;
  }, [selection.selectedItems]);

  return {
    handleEntityClick,
    handleVariantClick,
    isEntitySelected: checkEntitySelected,
    isVariantSelected: checkVariantSelected,
    clearSelection,
    selectAll,
    selectedCount,
  };
}
