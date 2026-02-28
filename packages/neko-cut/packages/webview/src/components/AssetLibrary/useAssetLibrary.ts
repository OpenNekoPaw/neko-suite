/**
 * Asset Library Hook
 *
 * Manages asset library state and communication with Extension.
 */

import { useState, useCallback, useEffect } from 'react';
import type {
	AssetEntity,
	AssetVariant,
	AssetQuery,
	SearchResult,
	CreateEntityInput,
	UpdateEntityInput,
	CreateVariantInput,
	MoveVariantInput,
	MoveVariantResult,
	MergeEntitiesInput,
	MergeEntitiesResult,
} from '@neko/shared';
import { sendRequest, sendMessage } from '../../utils/vscodeApi';
import { getLogger } from '../../utils/logger';

const logger = getLogger('AssetLibrary');
import type {
	AssetFilterState,
	AssetSelectionState,
} from './types';
import { createDefaultFilter, createDefaultSelection } from './types';
import type { AttributeDiff } from './DiffViewer/types';

// =============================================================================
// Comparison Types
// =============================================================================

export interface ComparisonTarget {
	entityId: string;
	variantId: string;
}

export interface ComparisonState {
	isComparing: boolean;
	selectedVariants: ComparisonTarget[];
	entity: AssetEntity | null;
	variantA: AssetVariant | null;
	variantB: AssetVariant | null;
	attributeDiffs: AttributeDiff[];
	fileSimilarity?: number;
}

// =============================================================================
// Hook Return Type
// =============================================================================

export interface UseAssetLibraryReturn {
	// Data
	entities: AssetEntity[];
	tags: Array<{ tag: string; count: number }>;
	isLoading: boolean;
	error: string | null;

	// Filter
	filter: AssetFilterState;
	setFilter: (filter: AssetFilterState) => void;

	// Selection (multi-select support)
	selection: AssetSelectionState;
	setSelection: (selection: AssetSelectionState | ((prev: AssetSelectionState) => AssetSelectionState)) => void;
	toggleEntityExpand: (entityId: string) => void;
	clearSelection: () => void;

	// Entity Operations
	createEntity: (input: CreateEntityInput) => Promise<AssetEntity>;
	updateEntity: (id: string, updates: UpdateEntityInput) => Promise<AssetEntity>;
	deleteEntity: (id: string) => Promise<boolean>;
	mergeEntities: (input: MergeEntitiesInput) => Promise<MergeEntitiesResult>;

	// Variant Operations
	addVariant: (entityId: string, input: CreateVariantInput) => Promise<AssetVariant>;
	deleteVariant: (entityId: string, variantId: string) => Promise<boolean>;
	moveVariant: (input: MoveVariantInput) => Promise<MoveVariantResult>;

	// Import
	importFromDialog: () => Promise<void>;
	importFiles: (files: File[]) => Promise<void>;
	importByPaths: (paths: string[]) => Promise<void>;

	// Actions
	refresh: () => Promise<void>;
	recordUsage: (entityId: string) => Promise<void>;

	// Comparison
	comparison: ComparisonState;
	enterComparisonMode: () => void;
	exitComparisonMode: () => void;
	toggleVariantForCompare: (entityId: string, variantId: string) => void;
	executeComparison: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAssetLibrary(): UseAssetLibraryReturn {
	// State
	const [entities, setEntities] = useState<AssetEntity[]>([]);
	const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<AssetFilterState>(createDefaultFilter());
	const [selection, setSelection] = useState<AssetSelectionState>(createDefaultSelection());

	// Comparison state
	const [comparison, setComparison] = useState<ComparisonState>({
		isComparing: false,
		selectedVariants: [],
		entity: null,
		variantA: null,
		variantB: null,
		attributeDiffs: [],
	});

	// =========================================================================
	// Search and Fetch
	// =========================================================================

	const search = useCallback(async (query: AssetQuery): Promise<SearchResult> => {
		try {
			const result = await sendRequest<SearchResult>({
				type: 'asset:search',
				payload: query,
			});
			return result;
		} catch (err) {
			logger.error('Search failed:', err);
			throw err;
		}
	}, []);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			// Build query from filter
			const query: AssetQuery = {
				keyword: filter.keyword || undefined,
				categories: filter.category ? [filter.category] : undefined,
				tags: filter.tags.length > 0 ? filter.tags : undefined,
				sortBy: filter.sortBy,
				sortDirection: filter.sortDirection,
				variantAttributes: filter.variantAttributes ? {
					views: filter.variantAttributes.views,
					expressions: filter.variantAttributes.expressions,
					actions: filter.variantAttributes.actions,
					outfits: filter.variantAttributes.outfits,
				} : undefined,
			};

			const [searchResult, tagsResult] = await Promise.all([
				search(query),
				sendRequest<Array<{ tag: string; count: number }>>({
					type: 'asset:getAllTags',
					payload: {},
				}),
			]);

			setEntities(searchResult.entities);
			setTags(tagsResult);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load assets';
			setError(message);
		} finally {
			setIsLoading(false);
		}
	}, [filter, search]);

	// Auto-refresh when filter changes
	useEffect(() => {
		refresh();
	}, [refresh]);

	// =========================================================================
	// Selection
	// =========================================================================

	const toggleEntityExpand = useCallback((entityId: string) => {
		setSelection((prev) => {
			const newExpanded = new Set(prev.expandedEntityIds);
			if (newExpanded.has(entityId)) {
				newExpanded.delete(entityId);
			} else {
				newExpanded.add(entityId);
			}
			return { ...prev, expandedEntityIds: newExpanded };
		});
	}, []);

	const clearSelection = useCallback(() => {
		setSelection((prev) => ({
			...prev,
			selectedItems: [],
			lastSelectedItem: null,
			selectionAnchor: null,
		}));
	}, []);

	// =========================================================================
	// Entity Operations
	// =========================================================================

	const createEntity = useCallback(async (input: CreateEntityInput): Promise<AssetEntity> => {
		const entity = await sendRequest<AssetEntity>({
			type: 'asset:createEntity',
			payload: input,
		});
		await refresh();
		return entity;
	}, [refresh]);

	const updateEntity = useCallback(async (id: string, updates: UpdateEntityInput): Promise<AssetEntity> => {
		const entity = await sendRequest<AssetEntity>({
			type: 'asset:updateEntity',
			payload: { id, updates },
		});
		await refresh();
		return entity;
	}, [refresh]);

	const deleteEntity = useCallback(async (id: string): Promise<boolean> => {
		const result = await sendRequest<{ id: string; success: boolean }>({
			type: 'asset:deleteEntity',
			payload: { id },
		});
		if (result.success) {
			await refresh();
			// Clear selection if deleted entity was selected
			setSelection((prev) => ({
				...prev,
				selectedItems: prev.selectedItems.filter(
					(item) => !(item.type === 'entity' && item.entityId === id)
				),
			}));
		}
		return result.success;
	}, [refresh]);

	// =========================================================================
	// Variant Operations
	// =========================================================================

	const addVariant = useCallback(async (entityId: string, input: CreateVariantInput): Promise<AssetVariant> => {
		const variant = await sendRequest<AssetVariant>({
			type: 'asset:addVariant',
			payload: { entityId, input },
		});
		await refresh();
		return variant;
	}, [refresh]);

	const deleteVariant = useCallback(async (entityId: string, variantId: string): Promise<boolean> => {
		const result = await sendRequest<{ entityId: string; variantId: string; success: boolean }>({
			type: 'asset:deleteVariant',
			payload: { entityId, variantId },
		});
		if (result.success) {
			await refresh();
			// Clear selection if deleted variant was selected
			setSelection((prev) => ({
				...prev,
				selectedItems: prev.selectedItems.filter(
					(item) => !(item.type === 'variant' && item.entityId === entityId && item.variantId === variantId)
				),
			}));
		}
		return result.success;
	}, [refresh]);

	const moveVariant = useCallback(async (input: MoveVariantInput): Promise<MoveVariantResult> => {
		const result = await sendRequest<MoveVariantResult>({
			type: 'asset:moveVariant',
			payload: input,
		});
		await refresh();
		return result;
	}, [refresh]);

	const mergeEntities = useCallback(async (input: MergeEntitiesInput): Promise<MergeEntitiesResult> => {
		const result = await sendRequest<MergeEntitiesResult>({
			type: 'asset:mergeEntities',
			payload: input,
		});
		await refresh();
		// Update selection: remove source entity, keep target entity if selected
		setSelection((prev) => ({
			...prev,
			selectedItems: prev.selectedItems.filter(
				(item) => !(item.type === 'entity' && item.entityId === input.sourceEntityId)
			),
		}));
		return result;
	}, [refresh]);

	// =========================================================================
	// Import
	// =========================================================================

	const importFromDialog = useCallback(async () => {
		sendMessage({ type: 'asset:importFromDialog', payload: {} });
	}, []);

	const importFiles = useCallback(async (files: File[]) => {
		// TODO: Implement drag-drop import
		// This would require sending file data to Extension
		logger.info('Import files:', files);
	}, []);

	const importByPaths = useCallback(async (paths: string[]) => {
		for (const filePath of paths) {
			try {
				await sendRequest({
					type: 'asset:importFile',
					payload: { filePath, options: { autoClassify: true } },
				});
			} catch (err) {
				logger.error('Failed to import:', { filePath, error: err });
			}
		}
		// Refresh after all imports
		await refresh();
	}, [refresh]);

	// =========================================================================
	// Usage Tracking
	// =========================================================================

	const recordUsage = useCallback(async (entityId: string) => {
		await sendRequest({
			type: 'asset:recordUsage',
			payload: { id: entityId },
		});
	}, []);

	// =========================================================================
	// Comparison Mode
	// =========================================================================

	const enterComparisonMode = useCallback(() => {
		setComparison({
			isComparing: true,
			selectedVariants: [],
			entity: null,
			variantA: null,
			variantB: null,
			attributeDiffs: [],
		});
	}, []);

	const exitComparisonMode = useCallback(() => {
		setComparison({
			isComparing: false,
			selectedVariants: [],
			entity: null,
			variantA: null,
			variantB: null,
			attributeDiffs: [],
		});
	}, []);

	const toggleVariantForCompare = useCallback((entityId: string, variantId: string) => {
		setComparison((prev) => {
			const target: ComparisonTarget = { entityId, variantId };
			const existingIndex = prev.selectedVariants.findIndex(
				(v) => v.entityId === entityId && v.variantId === variantId
			);

			let newSelected: ComparisonTarget[];
			if (existingIndex >= 0) {
				// Remove if already selected
				newSelected = prev.selectedVariants.filter((_, i) => i !== existingIndex);
			} else if (prev.selectedVariants.length === 0) {
				// First selection - allow any variant
				newSelected = [target];
			} else if (prev.selectedVariants.length === 1) {
				// Second selection - must be from the same entity
				const firstTarget = prev.selectedVariants[0]!;
				if (firstTarget.entityId !== entityId) {
					// Different entity - replace the first selection
					newSelected = [target];
				} else {
					// Same entity - add as second
					newSelected = [...prev.selectedVariants, target];
				}
			} else {
				// Already have 2 - replace the second one (must be same entity as first)
				const firstTarget = prev.selectedVariants[0]!;
				if (firstTarget.entityId !== entityId) {
					// Different entity - start fresh with this one
					newSelected = [target];
				} else {
					// Same entity - replace the second
					newSelected = [firstTarget, target];
				}
			}

			return { ...prev, selectedVariants: newSelected };
		});
	}, []);

	const executeComparison = useCallback(() => {
		if (comparison.selectedVariants.length !== 2) return;

		const [target1, target2] = comparison.selectedVariants;
		if (!target1 || !target2) return;

		// Verify both variants are from the same entity
		if (target1.entityId !== target2.entityId) {
			logger.error('Cannot compare variants from different entities');
			return;
		}

		const entity = entities.find((e) => e.id === target1.entityId);
		if (!entity) return;

		// Send message to extension to open VSCode diff editor
		sendMessage({
			type: 'asset:compareVariants',
			payload: {
				entityId: target1.entityId,
				variantIdA: target1.variantId,
				variantIdB: target2.variantId,
			},
		});

		// Exit comparison mode after triggering comparison
		exitComparisonMode();
	}, [comparison.selectedVariants, entities, exitComparisonMode]);

	// =========================================================================
	// Message Listener
	// =========================================================================

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			if (!message || typeof message.type !== 'string') return;

			// Handle import results (both single and batch imports)
			if (message.type === 'asset:importResult' || message.type === 'asset:importResults') {
				refresh();
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [refresh]);

	return {
		// Data
		entities,
		tags,
		isLoading,
		error,

		// Filter
		filter,
		setFilter,

		// Selection
		selection,
		setSelection,
		toggleEntityExpand,
		clearSelection,

		// Entity Operations
		createEntity,
		updateEntity,
		deleteEntity,
		mergeEntities,

		// Variant Operations
		addVariant,
		deleteVariant,
		moveVariant,

		// Import
		importFromDialog,
		importFiles,
		importByPaths,

		// Actions
		refresh,
		recordUsage,

		// Comparison
		comparison,
		enterComparisonMode,
		exitComparisonMode,
		toggleVariantForCompare,
		executeComparison,
	};
}
