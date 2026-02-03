/**
 * Entity Selector Modal Component
 *
 * Modal dialog for selecting a target entity when moving variants or merging entities.
 */

import { memo, useState, useCallback, useMemo } from 'react';
import type { AssetEntity, EntityCategory } from '@neko/shared';
import { getCategoryInfo, CATEGORY_INFO } from './types';
import { useTranslation } from '@/i18n/I18nContext';

interface EntitySelectorModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Modal title */
	title: string;
	/** List of all entities to select from */
	entities: AssetEntity[];
	/** Entity ID to exclude from selection (source entity) */
	excludeEntityId?: string;
	/** Called when an entity is selected */
	onSelect: (entityId: string) => void;
	/** Called when modal is closed */
	onClose: () => void;
}

export const EntitySelectorModal = memo(function EntitySelectorModal({
	isOpen,
	title,
	entities,
	excludeEntityId,
	onSelect,
	onClose,
}: EntitySelectorModalProps) {
	const { t } = useTranslation();
	const [searchKeyword, setSearchKeyword] = useState('');
	const [selectedCategory, setSelectedCategory] = useState<EntityCategory | null>(null);

	// Filter entities
	const filteredEntities = useMemo(() => {
		return entities.filter((entity) => {
			// Exclude the source entity
			if (entity.id === excludeEntityId) {
				return false;
			}
			// Filter by category
			if (selectedCategory && entity.category !== selectedCategory) {
				return false;
			}
			// Filter by keyword
			if (searchKeyword) {
				const keyword = searchKeyword.toLowerCase();
				return (
					entity.name.toLowerCase().includes(keyword) ||
					entity.description?.toLowerCase().includes(keyword) ||
					entity.tags.some((tag) => tag.toLowerCase().includes(keyword))
				);
			}
			return true;
		});
	}, [entities, excludeEntityId, selectedCategory, searchKeyword]);

	const handleSelect = useCallback(
		(entityId: string) => {
			onSelect(entityId);
			onClose();
		},
		[onSelect, onClose]
	);

	const handleBackdropClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === e.currentTarget) {
				onClose();
			}
		},
		[onClose]
	);

	if (!isOpen) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 flex items-center justify-center z-50"
			style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
			onClick={handleBackdropClick}
		>
			<div
				className="rounded-lg shadow-xl w-[400px] max-h-[600px] flex flex-col"
				style={{ backgroundColor: 'var(--vscode-editor-background)' }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					className="px-4 py-3 flex items-center justify-between"
					style={{ borderBottom: '1px solid var(--vscode-widget-border)' }}
				>
					<h3 className="text-sm font-medium">{title}</h3>
					<button
						onClick={onClose}
						className="p-1 rounded"
						style={{ color: 'var(--vscode-icon-foreground)' }}
						onMouseEnter={(e) =>
							(e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)')
						}
						onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Search and Filter */}
				<div className="px-4 py-2 space-y-2">
					{/* Search */}
					<input
						type="text"
						placeholder={t('assetLibrary.searchPlaceholder')}
						value={searchKeyword}
						onChange={(e) => setSearchKeyword(e.target.value)}
						className="w-full px-3 py-1.5 rounded text-sm"
						style={{
							backgroundColor: 'var(--vscode-input-background)',
							border: '1px solid var(--vscode-input-border)',
							color: 'var(--vscode-input-foreground)',
						}}
					/>

					{/* Category tabs */}
					<div className="flex flex-wrap gap-1">
						<button
							onClick={() => setSelectedCategory(null)}
							className="px-2 py-1 rounded text-xs"
							style={{
								backgroundColor:
									selectedCategory === null
										? 'var(--vscode-button-background)'
										: 'var(--vscode-button-secondaryBackground)',
								color:
									selectedCategory === null
										? 'var(--vscode-button-foreground)'
										: 'var(--vscode-button-secondaryForeground)',
							}}
						>
							{t('assetLibrary.category.all')}
						</button>
						{CATEGORY_INFO.map((cat) => (
							<button
								key={cat.id}
								onClick={() => setSelectedCategory(cat.id)}
								className="px-2 py-1 rounded text-xs flex items-center gap-1"
								style={{
									backgroundColor:
										selectedCategory === cat.id
											? 'var(--vscode-button-background)'
											: 'var(--vscode-button-secondaryBackground)',
									color:
										selectedCategory === cat.id
											? 'var(--vscode-button-foreground)'
											: 'var(--vscode-button-secondaryForeground)',
								}}
							>
								<span>{cat.icon}</span>
							</button>
						))}
					</div>
				</div>

				{/* Entity list */}
				<div
					className="flex-1 overflow-y-auto px-4 py-2"
					style={{ minHeight: '200px', maxHeight: '400px' }}
				>
					{filteredEntities.length === 0 ? (
						<div
							className="text-center py-8 text-sm"
							style={{ color: 'var(--vscode-descriptionForeground)' }}
						>
							{t('assetLibrary.noResults')}
						</div>
					) : (
						<div className="space-y-1">
							{filteredEntities.map((entity) => {
								const categoryInfo = getCategoryInfo(entity.category);
								return (
									<button
										key={entity.id}
										onClick={() => handleSelect(entity.id)}
										className="w-full flex items-center gap-2 p-2 rounded text-left"
										style={{ backgroundColor: 'var(--vscode-list-hoverBackground)' }}
										onMouseEnter={(e) =>
											(e.currentTarget.style.backgroundColor =
												'var(--vscode-list-activeSelectionBackground)')
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.backgroundColor =
												'var(--vscode-list-hoverBackground)')
										}
									>
										{/* Icon */}
										<div
											className="w-8 h-8 rounded flex items-center justify-center text-sm flex-shrink-0"
											style={{ backgroundColor: 'var(--vscode-badge-background)' }}
										>
											{categoryInfo.icon}
										</div>

										{/* Info */}
										<div className="flex-1 min-w-0">
											<div className="text-xs font-medium truncate">{entity.name}</div>
											<div
												className="text-xs flex items-center gap-1"
												style={{ color: 'var(--vscode-descriptionForeground)' }}
											>
												<span>{t(categoryInfo.labelKey)}</span>
												<span>·</span>
												<span>{t('assetLibrary.variantCount', { count: entity.variants.length })}</span>
											</div>
										</div>

										{/* Arrow */}
										<svg
											className="w-4 h-4 flex-shrink-0"
											style={{ color: 'var(--vscode-icon-foreground)' }}
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M9 5l7 7-7 7"
											/>
										</svg>
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					className="px-4 py-3 flex justify-end"
					style={{ borderTop: '1px solid var(--vscode-widget-border)' }}
				>
					<button
						onClick={onClose}
						className="px-3 py-1.5 rounded text-sm"
						style={{
							backgroundColor: 'var(--vscode-button-secondaryBackground)',
							color: 'var(--vscode-button-secondaryForeground)',
						}}
						onMouseEnter={(e) =>
							(e.currentTarget.style.backgroundColor =
								'var(--vscode-button-secondaryHoverBackground)')
						}
						onMouseLeave={(e) =>
							(e.currentTarget.style.backgroundColor =
								'var(--vscode-button-secondaryBackground)')
						}
					>
						{t('common.cancel')}
					</button>
				</div>
			</div>
		</div>
	);
});
