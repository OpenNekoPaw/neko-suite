/**
 * Asset Panel Component
 *
 * Main asset library panel with search, filter, and entity grid.
 * Uses VSCode theme variables for consistent styling.
 */

import { memo, useCallback, useState, useMemo } from 'react';
import type { AssetEntity, AssetVariant, CreateEntityInput } from '@neko/shared';
import { useAssetLibrary } from './useAssetLibrary';
import { useAssetSelection } from './useAssetSelection';
import { useAssetDragDrop } from './useAssetDragDrop';
import { CategoryTabs } from './CategoryTabs';
import { EntityCard } from './EntityCard';
import { EntitySelectorModal } from './EntitySelectorModal';
import { CreateEntityModal } from './CreateEntityModal';
import { AssetFilter } from './AssetFilter';
import type { AssetPanelProps, VariantAttributeFilter } from './types';
import { useTranslation } from '@/i18n/I18nContext';

export const AssetPanel = memo(function AssetPanel({
	onAssetDoubleClick: _onAssetDoubleClick,
	disabled,
}: AssetPanelProps) {
	const { t } = useTranslation();
	const {
		entities,
		tags,
		isLoading,
		error,
		filter,
		setFilter,
		selection,
		setSelection,
		toggleEntityExpand,
		deleteEntity,
		importFromDialog,
		importByPaths,
		refresh,
		moveVariant,
		mergeEntities,
		createEntity,
		comparison,
		enterComparisonMode,
		exitComparisonMode,
		toggleVariantForCompare,
		executeComparison,
	} = useAssetLibrary();

	// Multi-selection support
	const {
		handleEntityClick,
		handleVariantClick,
		isEntitySelected,
		isVariantSelected,
	} = useAssetSelection({
		entities,
		selection,
		setSelection,
	});

	// Internal drag-drop support (move variants, merge entities)
	const {
		dropTarget,
		handleInternalDragStart,
		handleDragOverEntity,
		handleDragLeave: handleInternalDragLeave,
		handleDropOnEntity,
	} = useAssetDragDrop({
		moveVariant,
		mergeEntities,
		onOperationComplete: refresh,
	});

	const [searchInput, setSearchInput] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);

	// Modal states
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [entitySelectorModal, setEntitySelectorModal] = useState<{
		isOpen: boolean;
		title: string;
		excludeEntityId?: string;
		mode: 'merge' | 'move';
		variantId?: string;
	}>({ isOpen: false, title: '', mode: 'merge' });

	// Collect available outfits from all entities for the filter
	const availableOutfits = useMemo(() => {
		const outfitSet = new Set<string>();
		for (const entity of entities) {
			for (const variant of entity.variants) {
				if (variant.attributes.outfit) {
					outfitSet.add(variant.attributes.outfit);
				}
			}
		}
		return Array.from(outfitSet).sort();
	}, [entities]);

	// =========================================================================
	// Event Handlers
	// =========================================================================

	const handleCategoryChange = useCallback((category: string | null) => {
		setFilter({ ...filter, category: category as typeof filter.category });
	}, [filter, setFilter]);

	const handleVariantAttributeFilterChange = useCallback((variantAttributes: VariantAttributeFilter) => {
		// Only include non-empty arrays
		const cleanedAttributes: VariantAttributeFilter = {};
		if (variantAttributes.views && variantAttributes.views.length > 0) {
			cleanedAttributes.views = variantAttributes.views;
		}
		if (variantAttributes.expressions && variantAttributes.expressions.length > 0) {
			cleanedAttributes.expressions = variantAttributes.expressions;
		}
		if (variantAttributes.actions && variantAttributes.actions.length > 0) {
			cleanedAttributes.actions = variantAttributes.actions;
		}
		if (variantAttributes.outfits && variantAttributes.outfits.length > 0) {
			cleanedAttributes.outfits = variantAttributes.outfits;
		}

		setFilter({
			...filter,
			variantAttributes: Object.keys(cleanedAttributes).length > 0 ? cleanedAttributes : undefined,
		});
	}, [filter, setFilter]);

	const handleSearchSubmit = useCallback((e: React.FormEvent) => {
		e.preventDefault();
		setFilter({ ...filter, keyword: searchInput });
	}, [filter, searchInput, setFilter]);

	const handleSearchClear = useCallback(() => {
		setSearchInput('');
		setFilter({ ...filter, keyword: '' });
	}, [filter, setFilter]);

	const handleVariantDragStart = useCallback((
		e: React.DragEvent,
		entity: AssetEntity,
		variant: AssetVariant
	) => {
		// Check if the dragged variant is part of multi-selection
		const isVariantInSelection = selection.selectedItems.some(
			(item) => item.type === 'variant' && item.entityId === entity.id && item.variantId === variant.id
		);

		// Get all selected variants
		const selectedVariantItems = selection.selectedItems.filter(
			(item) => item.type === 'variant' && item.variantId
		);

		// Also start internal drag for move/merge operations
		if (isVariantInSelection && selectedVariantItems.length > 0) {
			handleInternalDragStart(e, selection.selectedItems);
		} else {
			// Single item drag
			handleInternalDragStart(e, [{ type: 'variant', entityId: entity.id, variantId: variant.id }]);
		}

		if (isVariantInSelection && selectedVariantItems.length > 1) {
			// Multi-select drag: include all selected variants
			const items = selectedVariantItems
				.map((item) => {
					const ent = entities.find((en) => en.id === item.entityId);
					const vari = ent?.variants.find((v) => v.id === item.variantId);
					if (!ent || !vari) return null;
					return {
						entityId: ent.id,
						variantId: vari.id,
						entityName: ent.name,
						variantName: vari.name,
						category: ent.category,
						files: vari.files,
					};
				})
				.filter((x): x is NonNullable<typeof x> => x !== null);

			e.dataTransfer.setData('application/json', JSON.stringify({
				type: 'assets',
				items,
			}));

			// Set drag image with count badge
			const dragEl = document.createElement('div');
			dragEl.style.cssText = 'position:absolute;top:-1000px;padding:4px 8px;background:#007acc;color:white;border-radius:4px;font-size:12px;';
			dragEl.textContent = `${items.length} items`;
			document.body.appendChild(dragEl);
			e.dataTransfer.setDragImage(dragEl, 0, 0);
			setTimeout(() => document.body.removeChild(dragEl), 0);
		} else {
			// Single asset drag (backward compatible)
			e.dataTransfer.setData('application/json', JSON.stringify({
				type: 'asset',
				entityId: entity.id,
				variantId: variant.id,
				entityName: entity.name,
				variantName: variant.name,
				category: entity.category,
				files: variant.files,
			}));
		}
		e.dataTransfer.effectAllowed = 'copyMove';
	}, [selection.selectedItems, entities, handleInternalDragStart]);

	// =========================================================================
	// Merge and Move Handlers
	// =========================================================================

	const handleMergeInto = useCallback((sourceEntityId: string) => {
		setEntitySelectorModal({
			isOpen: true,
			title: t('assetLibrary.selectEntity.mergeTitle'),
			excludeEntityId: sourceEntityId,
			mode: 'merge',
		});
	}, [t]);

	const handleMoveVariant = useCallback((sourceEntityId: string, variantId: string) => {
		setEntitySelectorModal({
			isOpen: true,
			title: t('assetLibrary.selectEntity.moveTitle'),
			excludeEntityId: sourceEntityId,
			mode: 'move',
			variantId,
		});
	}, [t]);

	const handleEntitySelect = useCallback(async (targetEntityId: string) => {
		const { mode, excludeEntityId, variantId } = entitySelectorModal;

		if (mode === 'merge' && excludeEntityId) {
			await mergeEntities({
				sourceEntityId: excludeEntityId,
				targetEntityId,
				mergeTags: true,
				mergeAliases: true,
			});
		} else if (mode === 'move' && excludeEntityId && variantId) {
			await moveVariant({
				sourceEntityId: excludeEntityId,
				variantId,
				targetEntityId,
			});
		}

		setEntitySelectorModal({ isOpen: false, title: '', mode: 'merge' });
	}, [entitySelectorModal, mergeEntities, moveVariant]);

	const handleCreateEntity = useCallback(async (input: CreateEntityInput) => {
		await createEntity(input);
	}, [createEntity]);

	// =========================================================================
	// Drag and Drop Handlers
	// =========================================================================

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		// Check if this is a file drag (not an asset drag from within the panel)
		if (e.dataTransfer.types.includes('Files')) {
			e.dataTransfer.dropEffect = 'copy';
			setIsDragOver(true);
		}
	}, []);

	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer.types.includes('Files')) {
			setIsDragOver(true);
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		// Only set false if we're leaving the drop zone entirely
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;
		if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
			setIsDragOver(false);
		}
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);

		// Get file paths from VSCode drag data
		// VSCode provides file paths in a special format
		const uriList = e.dataTransfer.getData('text/uri-list');
		if (uriList) {
			const paths = uriList
				.split('\n')
				.filter(line => line && !line.startsWith('#'))
				.map(uri => {
					// Convert file:// URI to path
					try {
						const url = new URL(uri.trim());
						if (url.protocol === 'file:') {
							return decodeURIComponent(url.pathname);
						}
					} catch {
						// Not a valid URL
					}
					return null;
				})
				.filter((p): p is string => p !== null);

			if (paths.length > 0) {
				importByPaths(paths);
				return;
			}
		}

		// Fallback: try to get paths from Files (may not work in VSCode webview)
		const files = Array.from(e.dataTransfer.files);
		if (files.length > 0) {
			// In webview, we can't access file.path directly
			// Send a message to Extension Host to handle the drop
			const filePaths = files
				.map(f => (f as File & { path?: string }).path)
				.filter((p): p is string => !!p);
			if (filePaths.length > 0) {
				importByPaths(filePaths);
			}
		}
	}, [importByPaths]);

	// =========================================================================
	// Render
	// =========================================================================

	return (
		<div
			className={`flex flex-col h-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
			style={{
				backgroundColor: 'var(--vscode-sideBar-background)',
				color: 'var(--vscode-sideBar-foreground)',
			}}
			onDragOver={handleDragOver}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{/* Drag Overlay */}
			{isDragOver && (
				<div
					className="absolute inset-0 z-50 flex items-center justify-center"
					style={{
						backgroundColor: 'var(--vscode-editor-background)',
						opacity: 0.95,
						border: '2px dashed var(--vscode-focusBorder)',
						borderRadius: '4px',
						margin: '4px',
					}}
				>
					<div className="text-center">
						<svg className="w-12 h-12 mx-auto mb-2" style={{ color: 'var(--vscode-focusBorder)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
						</svg>
						<p className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
							{t('assetLibrary.dropToImport')}
						</p>
					</div>
				</div>
			)}
			{/* Header */}
			<div
				className="flex items-center justify-between px-3 py-2"
				style={{ borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)' }}
			>
				<h2
					className="text-xs font-semibold uppercase tracking-wide"
					style={{ color: 'var(--vscode-sideBarSectionHeader-foreground)' }}
				>
					{t('assetLibrary.title')}
				</h2>
				<div className="flex items-center gap-1">
					{/* Refresh Button */}
					<button
						className="p-1 rounded"
						onClick={refresh}
						title={t('assetLibrary.refresh')}
						aria-label={t('assetLibrary.refresh')}
						style={{
							color: 'var(--vscode-icon-foreground)',
						}}
						onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)'}
						onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
					</button>

					{/* Create Entity Button */}
					<button
						className="p-1 rounded"
						onClick={() => setIsCreateModalOpen(true)}
						title={t('assetLibrary.createEntity.title')}
						aria-label={t('assetLibrary.createEntity.title')}
						style={{
							color: 'var(--vscode-icon-foreground)',
						}}
						onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)'}
						onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
						</svg>
					</button>

					{/* Compare Button */}
					<button
						className="p-1 rounded"
						onClick={comparison.isComparing ? exitComparisonMode : enterComparisonMode}
						title={comparison.isComparing ? t('assetLibrary.comparison.exit') : t('assetLibrary.comparison.enter')}
						aria-label={comparison.isComparing ? t('assetLibrary.comparison.exit') : t('assetLibrary.comparison.enter')}
						style={{
							color: comparison.isComparing
								? 'var(--vscode-button-background)'
								: 'var(--vscode-icon-foreground)',
							backgroundColor: comparison.isComparing
								? 'var(--vscode-button-secondaryBackground)'
								: 'transparent',
						}}
						onMouseEnter={(e) => {
							if (!comparison.isComparing) {
								e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
							}
						}}
						onMouseLeave={(e) => {
							if (!comparison.isComparing) {
								e.currentTarget.style.backgroundColor = 'transparent';
							}
						}}
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
						</svg>
					</button>

					{/* Import Button */}
					<button
						className="vscode-button flex items-center gap-1 text-xs"
						onClick={importFromDialog}
						title={t('assetLibrary.import')}
						aria-label={t('assetLibrary.import')}
					>
						<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
						</svg>
						{t('assetLibrary.import')}
					</button>
				</div>
			</div>

			{/* Category Tabs */}
			<CategoryTabs
				activeCategory={filter.category}
				onCategoryChange={handleCategoryChange}
			/>

			{/* Variant Attribute Filter */}
			<AssetFilter
				filter={filter.variantAttributes ?? {}}
				onFilterChange={handleVariantAttributeFilterChange}
				availableOutfits={availableOutfits}
			/>

			{/* Search Bar */}
			<form
				onSubmit={handleSearchSubmit}
				className="px-2 py-2"
				style={{ borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)' }}
			>
				<div className="relative">
					<input
						type="text"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						placeholder={t('assetLibrary.searchPlaceholder')}
						className="vscode-input w-full pl-7 pr-7 text-xs"
					/>
					<svg
						className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
						style={{ color: 'var(--vscode-input-placeholderForeground)' }}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					{searchInput && (
						<button
							type="button"
							onClick={handleSearchClear}
							className="absolute right-2 top-1/2 -translate-y-1/2"
							style={{ color: 'var(--vscode-input-placeholderForeground)' }}
						>
							<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					)}
				</div>
			</form>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-2 py-1">
				{/* Loading */}
				{isLoading && (
					<div className="flex items-center justify-center py-8">
						<div
							className="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full"
							style={{ borderColor: 'var(--vscode-progressBar-background)', borderTopColor: 'transparent' }}
						/>
					</div>
				)}

				{/* Error */}
				{error && (
					<div
						className="p-3 rounded text-xs"
						style={{
							backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
							border: '1px solid var(--vscode-inputValidation-errorBorder)',
							color: 'var(--vscode-errorForeground)',
						}}
					>
						{error}
					</div>
				)}

				{/* Empty State */}
				{!isLoading && !error && entities.length === 0 && (
					<div
						className="flex flex-col items-center justify-center py-8 text-center"
						style={{ color: 'var(--vscode-descriptionForeground)' }}
					>
						<svg className="w-10 h-10 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
						<p className="text-xs">
							{filter.keyword || filter.category
								? t('assetLibrary.noResults')
								: t('assetLibrary.emptyHint')}
						</p>
					</div>
				)}

				{/* Entity Grid */}
				{!isLoading && !error && entities.length > 0 && (
					<div className="space-y-1">
						{entities.map((entity) => (
							<EntityCard
								key={entity.id}
								entity={entity}
								isSelected={isEntitySelected(entity.id)}
								isExpanded={selection.expandedEntityIds.has(entity.id)}
								onEntityClick={handleEntityClick}
								onVariantClick={handleVariantClick}
								onToggleExpand={() => toggleEntityExpand(entity.id)}
								onVariantDragStart={(e, ent, variant) => handleVariantDragStart(e, ent, variant)}
								onDelete={() => deleteEntity(entity.id)}
								onMergeInto={() => handleMergeInto(entity.id)}
								onMoveVariant={(variantId) => handleMoveVariant(entity.id, variantId)}
								comparisonMode={comparison.isComparing}
								selectedForCompare={comparison.selectedVariants}
								onToggleCompare={toggleVariantForCompare}
								isVariantSelected={isVariantSelected}
								isDropTarget={dropTarget?.entityId === entity.id}
								onDragOverEntity={handleDragOverEntity}
								onDragLeaveEntity={handleInternalDragLeave}
								onDropOnEntity={handleDropOnEntity}
							/>
						))}
					</div>
				)}
			</div>

			{/* Comparison Mode Bar */}
			{comparison.isComparing && (
				<div
					className="px-3 py-2 flex items-center justify-between"
					style={{
						borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)',
						backgroundColor: 'var(--vscode-button-secondaryBackground)',
					}}
				>
					<div className="text-xs" style={{ color: 'var(--vscode-foreground)' }}>
						{comparison.selectedVariants.length === 0 && t('assetLibrary.comparison.selectFirst')}
						{comparison.selectedVariants.length === 1 && t('assetLibrary.comparison.selectSecond')}
						{comparison.selectedVariants.length === 2 && t('assetLibrary.comparison.ready')}
					</div>
					<div className="flex items-center gap-2">
						{comparison.selectedVariants.length === 2 && (
							<button
								className="px-2 py-1 rounded text-xs"
								style={{
									backgroundColor: 'var(--vscode-button-background)',
									color: 'var(--vscode-button-foreground)',
								}}
								onClick={executeComparison}
								onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-button-hoverBackground)'}
								onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-button-background)'}
							>
								{t('assetLibrary.comparison.start')}
							</button>
						)}
						<button
							className="px-2 py-1 rounded text-xs"
							style={{
								backgroundColor: 'transparent',
								color: 'var(--vscode-foreground)',
							}}
							onClick={exitComparisonMode}
							onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)'}
							onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
						>
							{t('assetLibrary.comparison.cancel')}
						</button>
					</div>
				</div>
			)}

			{/* Footer - Stats */}
			<div
				className="px-3 py-1.5 text-xs"
				style={{
					borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)',
					color: 'var(--vscode-descriptionForeground)',
				}}
			>
				{t('assetLibrary.entityCount', { count: entities.length })}
				{tags.length > 0 && ` · ${t('assetLibrary.tagCount', { count: tags.length })}`}
			</div>

			{/* Modals */}
			<CreateEntityModal
				isOpen={isCreateModalOpen}
				onCreate={handleCreateEntity}
				onClose={() => setIsCreateModalOpen(false)}
			/>

			<EntitySelectorModal
				isOpen={entitySelectorModal.isOpen}
				title={entitySelectorModal.title}
				entities={entities}
				excludeEntityId={entitySelectorModal.excludeEntityId}
				onSelect={handleEntitySelect}
				onClose={() => setEntitySelectorModal({ isOpen: false, title: '', mode: 'merge' })}
			/>
		</div>
	);
});
