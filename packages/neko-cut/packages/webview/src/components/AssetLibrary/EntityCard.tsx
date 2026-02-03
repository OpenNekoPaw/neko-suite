/**
 * Entity Card Component
 *
 * Displays a single asset entity with thumbnail and actions.
 * Uses VSCode theme variables for consistent styling.
 */

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import type { AssetEntity, AssetVariant } from '@uniedit/shared';
import { getCategoryInfo } from './types';
import { useTranslation } from '@/i18n/I18nContext';
import type { ComparisonTarget } from './useAssetLibrary';

// Extended entity type with thumbnail URI from Extension Host
interface EntityWithThumbnail extends AssetEntity {
	_thumbnailUri?: string;
}

// Extended variant type with thumbnail URI from Extension Host
interface VariantWithThumbnail extends AssetVariant {
	_thumbnailUri?: string;
}

// Context menu position
interface ContextMenuPosition {
	x: number;
	y: number;
}

// Context menu target
interface ContextMenuTarget {
	type: 'entity' | 'variant';
	entityId: string;
	variantId?: string;
}

interface EntityCardProps {
	entity: EntityWithThumbnail;
	isSelected: boolean;
	isExpanded: boolean;
	onEntityClick: (entityId: string, e: React.MouseEvent) => void;
	onVariantClick: (entityId: string, variantId: string, e: React.MouseEvent) => void;
	onToggleExpand: () => void;
	onVariantDragStart: (e: React.DragEvent, entity: AssetEntity, variant: AssetVariant) => void;
	onDelete: () => void;
	onMergeInto?: () => void;
	onMoveVariant?: (variantId: string) => void;
	// Comparison mode props
	comparisonMode?: boolean;
	selectedForCompare?: ComparisonTarget[];
	onToggleCompare?: (entityId: string, variantId: string) => void;
	// Multi-select support
	isVariantSelected?: (entityId: string, variantId: string) => boolean;
	// Drop zone support
	isDropTarget?: boolean;
	onDragOverEntity?: (e: React.DragEvent, entityId: string) => void;
	onDragLeaveEntity?: (e: React.DragEvent) => void;
	onDropOnEntity?: (e: React.DragEvent, entityId: string) => Promise<void>;
}

export const EntityCard = memo(function EntityCard({
	entity,
	isSelected,
	isExpanded,
	onEntityClick,
	onVariantClick,
	onToggleExpand,
	onVariantDragStart,
	onDelete,
	onMergeInto,
	onMoveVariant,
	comparisonMode = false,
	selectedForCompare = [],
	onToggleCompare,
	isVariantSelected,
	isDropTarget = false,
	onDragOverEntity,
	onDragLeaveEntity,
	onDropOnEntity,
}: EntityCardProps) {
	const { t } = useTranslation();
	const categoryInfo = getCategoryInfo(entity.category);
	const variantCount = entity.variants.length;
	const [thumbnailError, setThumbnailError] = useState(false);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		position: ContextMenuPosition;
		target: ContextMenuTarget;
	} | null>(null);
	const contextMenuRef = useRef<HTMLDivElement>(null);

	// Close context menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
				setContextMenu(null);
			}
		};
		if (contextMenu) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [contextMenu]);

	const handleClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		onEntityClick(entity.id, e);
	}, [onEntityClick, entity.id]);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			position: { x: e.clientX, y: e.clientY },
			target: { type: 'entity', entityId: entity.id },
		});
	}, [entity.id]);

	const handleVariantContextMenu = useCallback((e: React.MouseEvent, variantId: string) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			position: { x: e.clientX, y: e.clientY },
			target: { type: 'variant', entityId: entity.id, variantId },
		});
	}, [entity.id]);

	const handleExpandClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		onToggleExpand();
	}, [onToggleExpand]);

	const handleDeleteClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		// Direct delete without confirm (VSCode webview sandbox blocks confirm())
		// TODO: Implement custom confirmation dialog or use Extension Host dialog
		onDelete();
	}, [onDelete]);

	const handleThumbnailError = useCallback(() => {
		setThumbnailError(true);
	}, []);

	// Drop zone handlers
	const handleDragOver = useCallback((e: React.DragEvent) => {
		onDragOverEntity?.(e, entity.id);
	}, [onDragOverEntity, entity.id]);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		onDragLeaveEntity?.(e);
	}, [onDragLeaveEntity]);

	const handleDrop = useCallback((e: React.DragEvent) => {
		onDropOnEntity?.(e, entity.id);
	}, [onDropOnEntity, entity.id]);

	return (
		<>
		<div
			className="rounded transition-all cursor-pointer"
			style={{
				backgroundColor: isSelected
					? 'var(--vscode-list-activeSelectionBackground)'
					: 'var(--vscode-sideBar-background)',
				color: isSelected
					? 'var(--vscode-list-activeSelectionForeground)'
					: 'var(--vscode-sideBar-foreground)',
				border: isSelected
					? '1px solid var(--vscode-focusBorder)'
					: '1px solid transparent',
				outline: isDropTarget
					? '2px dashed var(--vscode-focusBorder)'
					: 'none',
				outlineOffset: '-2px',
			}}
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onMouseEnter={(e) => {
				if (!isSelected) {
					e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
				}
			}}
			onMouseLeave={(e) => {
				if (!isSelected) {
					e.currentTarget.style.backgroundColor = 'var(--vscode-sideBar-background)';
				}
			}}
		>
			{/* Header */}
			<div className="p-2 flex items-center gap-2">
				{/* Thumbnail */}
				<div
					className="w-10 h-10 rounded flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
					style={{ backgroundColor: 'var(--vscode-badge-background)' }}
				>
					{entity._thumbnailUri && !thumbnailError ? (
						<img
							src={entity._thumbnailUri}
							alt={entity.name}
							className="w-full h-full object-cover"
							onError={handleThumbnailError}
						/>
					) : (
						categoryInfo.icon
					)}
				</div>

				{/* Info */}
				<div className="flex-1 min-w-0">
					<div className="text-xs font-medium truncate">{entity.name}</div>
					<div
						className="text-xs flex items-center gap-1.5"
						style={{ color: 'var(--vscode-descriptionForeground)' }}
					>
						<span>{t(categoryInfo.labelKey)}</span>
						<span>·</span>
						<span>{t('assetLibrary.variantCount', { count: variantCount })}</span>
					</div>
					{/* Description */}
					{entity.description && (
						<div
							className="text-xs mt-0.5 truncate"
							style={{ color: 'var(--vscode-descriptionForeground)' }}
							title={entity.description}
						>
							{entity.description}
						</div>
					)}
				</div>

				{/* Actions */}
				<div className="flex items-center gap-0.5">
					{/* Expand/Collapse */}
					{variantCount > 0 && (
						<button
							className="p-1 rounded"
							onClick={handleExpandClick}
							title={isExpanded ? t('assetLibrary.collapse') : t('assetLibrary.expand')}
							style={{ color: 'var(--vscode-icon-foreground)' }}
							onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)'}
							onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
						>
							<svg
								className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					)}

					{/* Delete */}
					<button
						className="p-1 rounded"
						onClick={handleDeleteClick}
						title={t('assetLibrary.delete')}
						style={{ color: 'var(--vscode-icon-foreground)' }}
						onMouseEnter={(e) => {
							e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
							e.currentTarget.style.color = 'var(--vscode-errorForeground)';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.backgroundColor = 'transparent';
							e.currentTarget.style.color = 'var(--vscode-icon-foreground)';
						}}
					>
						<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</div>
			</div>

			{/* Tags */}
			{entity.tags.length > 0 && (
				<div className="px-2 pb-2 flex flex-wrap gap-1">
					{entity.tags.slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="px-1.5 py-0.5 rounded text-xs"
							style={{
								backgroundColor: 'var(--vscode-badge-background)',
								color: 'var(--vscode-badge-foreground)',
							}}
						>
							{tag}
						</span>
					))}
					{entity.tags.length > 3 && (
						<span
							className="px-1.5 py-0.5 text-xs"
							style={{ color: 'var(--vscode-descriptionForeground)' }}
						>
							+{entity.tags.length - 3}
						</span>
					)}
				</div>
			)}

			{/* Expanded Variants */}
			{isExpanded && entity.variants.length > 0 && (
				<div
					className="p-2 space-y-1"
					style={{ borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)' }}
				>
					{entity.variants.map((variant) => {
						const variantWithThumb = variant as VariantWithThumbnail;
						const isSelectedForCompare = selectedForCompare.some(
							(t) => t.entityId === entity.id && t.variantId === variant.id
						);
						const isVariantSelectedForMulti = isVariantSelected?.(entity.id, variant.id) ?? false;
						const showAsSelected = comparisonMode ? isSelectedForCompare : isVariantSelectedForMulti;

						return (
						<div
							key={variant.id}
							className="flex items-center gap-2 p-1.5 rounded cursor-grab"
							style={{
								backgroundColor: showAsSelected
									? 'var(--vscode-list-activeSelectionBackground)'
									: 'var(--vscode-input-background)',
							}}
							draggable={!comparisonMode}
			onDragStart={(e) => !comparisonMode && onVariantDragStart(e, entity, variant)}
							onClick={(e) => {
								e.stopPropagation();
								if (comparisonMode && onToggleCompare) {
									onToggleCompare(entity.id, variant.id);
								} else {
									// Multi-select mode: pass event to handle Ctrl/Shift
									onVariantClick(entity.id, variant.id, e);
								}
							}}
							onContextMenu={(e) => !comparisonMode && handleVariantContextMenu(e, variant.id)}
							onMouseEnter={(e) => {
								if (!showAsSelected) {
									e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
								}
							}}
							onMouseLeave={(e) => {
								if (!showAsSelected) {
									e.currentTarget.style.backgroundColor = 'var(--vscode-input-background)';
								}
							}}
						>
							{/* Comparison checkbox */}
							{comparisonMode && (
								<div
									className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
									style={{
										borderColor: isSelectedForCompare
											? 'var(--vscode-button-background)'
											: 'var(--vscode-checkbox-border)',
										backgroundColor: isSelectedForCompare
											? 'var(--vscode-button-background)'
											: 'transparent',
									}}
								>
									{isSelectedForCompare && (
										<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
											<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									)}
								</div>
							)}

							{/* Variant thumbnail */}
							<div
								className="w-7 h-7 rounded flex items-center justify-center text-xs overflow-hidden"
								style={{ backgroundColor: 'var(--vscode-badge-background)' }}
							>
								{variantWithThumb._thumbnailUri ? (
									<img
										src={variantWithThumb._thumbnailUri}
										alt={variant.name}
										className="w-full h-full object-cover"
									/>
								) : (
									variant.id === entity.defaultVariantId ? '★' : '•'
								)}
							</div>

							{/* Variant info */}
							<div className="flex-1 min-w-0">
								<div className="text-xs truncate">{variant.name}</div>
								{variant.files[0]?.name && (
									<div
										className="text-xs truncate"
										style={{ color: 'var(--vscode-descriptionForeground)' }}
										title={variant.files[0].path}
									>
										{variant.files[0].name}
									</div>
								)}
								<div
									className="text-xs"
									style={{ color: 'var(--vscode-descriptionForeground)' }}
								>
									{variant.files.length > 1 && t('assetLibrary.fileCount', { count: variant.files.length })}
									{variant.attributes.view && `${variant.files.length > 1 ? ' · ' : ''}${variant.attributes.view}`}
									{variant.attributes.expression && ` · ${variant.attributes.expression}`}
								</div>
							</div>
						</div>
					);
					})}
				</div>
			)}
		</div>

		{/* Context Menu */}
		{contextMenu && (
			<div
				ref={contextMenuRef}
				className="fixed z-50 py-1 rounded shadow-lg min-w-[160px]"
				style={{
					left: contextMenu.position.x,
					top: contextMenu.position.y,
					backgroundColor: 'var(--vscode-menu-background)',
					border: '1px solid var(--vscode-menu-border)',
				}}
			>
				{contextMenu.target.type === 'entity' ? (
					<>
						{/* Merge into another entity */}
						{onMergeInto && (
							<button
								className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2"
								style={{ color: 'var(--vscode-menu-foreground)' }}
								onClick={() => {
									setContextMenu(null);
									onMergeInto();
								}}
								onMouseEnter={(e) =>
									(e.currentTarget.style.backgroundColor =
										'var(--vscode-menu-selectionBackground)')
								}
								onMouseLeave={(e) =>
									(e.currentTarget.style.backgroundColor = 'transparent')
								}
							>
								<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
								</svg>
								{t('assetLibrary.actions.mergeInto')}
							</button>
						)}
						{/* Delete */}
						<button
							className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2"
							style={{ color: 'var(--vscode-errorForeground)' }}
							onClick={() => {
								setContextMenu(null);
								onDelete();
							}}
							onMouseEnter={(e) =>
								(e.currentTarget.style.backgroundColor =
									'var(--vscode-menu-selectionBackground)')
							}
							onMouseLeave={(e) =>
								(e.currentTarget.style.backgroundColor = 'transparent')
							}
						>
							<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
							{t('assetLibrary.delete')}
						</button>
					</>
				) : (
					<>
						{/* Move variant to another entity */}
						{onMoveVariant && contextMenu.target.variantId && (
							<button
								className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2"
								style={{ color: 'var(--vscode-menu-foreground)' }}
								onClick={() => {
									const variantId = contextMenu.target.variantId;
									setContextMenu(null);
									if (variantId) {
										onMoveVariant(variantId);
									}
								}}
								onMouseEnter={(e) =>
									(e.currentTarget.style.backgroundColor =
										'var(--vscode-menu-selectionBackground)')
								}
								onMouseLeave={(e) =>
									(e.currentTarget.style.backgroundColor = 'transparent')
								}
							>
								<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
								</svg>
								{t('assetLibrary.actions.moveToEntity')}
							</button>
						)}
					</>
				)}
			</div>
		)}
		</>
	);
});
