/**
 * Asset Drag Drop Hook
 *
 * Manages drag and drop within the asset library for:
 * - Moving variants between entities
 * - Merging entities
 */

import { useState, useCallback } from 'react';
import type { MoveVariantInput, MergeEntitiesInput, MoveVariantResult, MergeEntitiesResult } from '@neko/shared';
import { ASSET_INTERNAL_DRAG_MIME, type AssetInternalDragData } from '@neko/shared';
import type { SelectionItem } from './types';

/** @deprecated Use ASSET_INTERNAL_DRAG_MIME from @neko/shared */
export const ASSET_INTERNAL_DRAG_TYPE = ASSET_INTERNAL_DRAG_MIME;

/** Drop target information */
export interface DropTarget {
	type: 'entity' | 'variant';
	entityId: string;
	variantId?: string;
}

export interface UseAssetDragDropOptions {
	moveVariant: (input: MoveVariantInput) => Promise<MoveVariantResult>;
	mergeEntities: (input: MergeEntitiesInput) => Promise<MergeEntitiesResult>;
	onOperationComplete?: () => void;
}

export interface UseAssetDragDropReturn {
	/** Current drop target (for visual feedback) */
	dropTarget: DropTarget | null;
	/** Start internal drag operation */
	handleInternalDragStart: (e: React.DragEvent, sourceItems: SelectionItem[]) => void;
	/** Handle drag over entity */
	handleDragOverEntity: (e: React.DragEvent, entityId: string) => void;
	/** Handle drag leave */
	handleDragLeave: (e: React.DragEvent) => void;
	/** Handle drop on entity */
	handleDropOnEntity: (e: React.DragEvent, targetEntityId: string) => Promise<void>;
	/** Check if entity is a valid drop target */
	isValidDropTarget: (entityId: string, sourceItems: SelectionItem[]) => boolean;
}

export function useAssetDragDrop({
	moveVariant,
	mergeEntities,
	onOperationComplete,
}: UseAssetDragDropOptions): UseAssetDragDropReturn {
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

	/**
	 * Start internal drag operation
	 */
	const handleInternalDragStart = useCallback((
		e: React.DragEvent,
		sourceItems: SelectionItem[]
	) => {
		const dragData: AssetInternalDragData = {
			type: 'asset-internal',
			sourceItems,
		};
		e.dataTransfer.setData(ASSET_INTERNAL_DRAG_MIME, JSON.stringify(dragData));
		e.dataTransfer.effectAllowed = 'move';
	}, []);

	/**
	 * Check if entity is a valid drop target for the source items
	 */
	const isValidDropTarget = useCallback((
		entityId: string,
		sourceItems: SelectionItem[]
	): boolean => {
		// Can't drop on self
		for (const item of sourceItems) {
			if (item.type === 'entity' && item.entityId === entityId) {
				return false;
			}
		}
		return true;
	}, []);

	/**
	 * Handle drag over entity
	 */
	const handleDragOverEntity = useCallback((
		e: React.DragEvent,
		entityId: string
	) => {
		// Check if this is internal drag
		if (e.dataTransfer.types.includes(ASSET_INTERNAL_DRAG_MIME)) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			setDropTarget({ type: 'entity', entityId });
		}
	}, []);

	/**
	 * Handle drag leave
	 */
	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDropTarget(null);
	}, []);

	/**
	 * Handle drop on entity
	 */
	const handleDropOnEntity = useCallback(async (
		e: React.DragEvent,
		targetEntityId: string
	) => {
		e.preventDefault();
		setDropTarget(null);

		const internalData = e.dataTransfer.getData(ASSET_INTERNAL_DRAG_MIME);
		if (!internalData) return;

		try {
			const dragData: AssetInternalDragData = JSON.parse(internalData);
			const sourceItems = dragData.sourceItems;

			// Separate entities and variants
			const entityItems = sourceItems.filter((s) => s.type === 'entity');
			const variantItems = sourceItems.filter((s) => s.type === 'variant' && s.variantId);

			// Process entity merges (drag entity onto another entity)
			for (const item of entityItems) {
				if (item.entityId !== targetEntityId) {
					await mergeEntities({
						sourceEntityId: item.entityId,
						targetEntityId,
						mergeTags: true,
						mergeAliases: true,
					});
				}
			}

			// Process variant moves (drag variant onto entity)
			for (const item of variantItems) {
				if (item.entityId !== targetEntityId && item.variantId) {
					await moveVariant({
						sourceEntityId: item.entityId,
						variantId: item.variantId,
						targetEntityId,
					});
				}
			}

			onOperationComplete?.();
		} catch (err) {
			console.error('[useAssetDragDrop] Drop operation failed:', err);
		}
	}, [moveVariant, mergeEntities, onOperationComplete]);

	return {
		dropTarget,
		handleInternalDragStart,
		handleDragOverEntity,
		handleDragLeave,
		handleDropOnEntity,
		isValidDropTarget,
	};
}
