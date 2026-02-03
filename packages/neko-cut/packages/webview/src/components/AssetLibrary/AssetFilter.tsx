/**
 * Asset Filter Component
 *
 * Collapsible filter panel for filtering assets by variant attributes.
 */

import { memo, useCallback, useState, useMemo } from 'react';
import type { ViewAngle, ExpressionState, ActionState } from '@neko/shared';
import type { VariantAttributeFilter } from './types';
import { useTranslation } from '@/i18n/I18nContext';

// =============================================================================
// Filter Options
// =============================================================================

const VIEW_OPTIONS: ViewAngle[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'isometric', '3/4'];
const EXPRESSION_OPTIONS: ExpressionState[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'talking', 'sleeping', 'custom'];
const ACTION_OPTIONS: ActionState[] = ['idle', 'walk', 'run', 'jump', 'attack', 'sit', 'lie', 'custom'];

// =============================================================================
// Component Props
// =============================================================================

interface AssetFilterProps {
	/** Current filter state */
	filter: VariantAttributeFilter;
	/** Called when filter changes */
	onFilterChange: (filter: VariantAttributeFilter) => void;
	/** Available outfit names from current entities */
	availableOutfits?: string[];
}

// =============================================================================
// Sub-components
// =============================================================================

interface FilterSectionProps {
	title: string;
	options: string[];
	selected: string[];
	onChange: (selected: string[]) => void;
	getLabel?: (option: string) => string;
}

const FilterSection = memo(function FilterSection({
	title,
	options,
	selected,
	onChange,
	getLabel,
}: FilterSectionProps) {
	const toggleOption = useCallback((option: string) => {
		if (selected.includes(option)) {
			onChange(selected.filter((s) => s !== option));
		} else {
			onChange([...selected, option]);
		}
	}, [selected, onChange]);

	return (
		<div className="space-y-1.5">
			<div
				className="text-xs font-medium"
				style={{ color: 'var(--vscode-foreground)' }}
			>
				{title}
			</div>
			<div className="flex flex-wrap gap-1">
				{options.map((option) => {
					const isSelected = selected.includes(option);
					return (
						<button
							key={option}
							onClick={() => toggleOption(option)}
							className="px-2 py-0.5 rounded text-xs transition-colors"
							style={{
								backgroundColor: isSelected
									? 'var(--vscode-button-background)'
									: 'var(--vscode-button-secondaryBackground)',
								color: isSelected
									? 'var(--vscode-button-foreground)'
									: 'var(--vscode-button-secondaryForeground)',
							}}
						>
							{getLabel ? getLabel(option) : option}
						</button>
					);
				})}
			</div>
		</div>
	);
});

// =============================================================================
// Main Component
// =============================================================================

export const AssetFilter = memo(function AssetFilter({
	filter,
	onFilterChange,
	availableOutfits = [],
}: AssetFilterProps) {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);

	// Count active filters
	const activeFilterCount = useMemo(() => {
		let count = 0;
		if (filter.views && filter.views.length > 0) count += filter.views.length;
		if (filter.expressions && filter.expressions.length > 0) count += filter.expressions.length;
		if (filter.actions && filter.actions.length > 0) count += filter.actions.length;
		if (filter.outfits && filter.outfits.length > 0) count += filter.outfits.length;
		return count;
	}, [filter]);

	const handleViewsChange = useCallback((views: string[]) => {
		onFilterChange({ ...filter, views: views as ViewAngle[] });
	}, [filter, onFilterChange]);

	const handleExpressionsChange = useCallback((expressions: string[]) => {
		onFilterChange({ ...filter, expressions: expressions as ExpressionState[] });
	}, [filter, onFilterChange]);

	const handleActionsChange = useCallback((actions: string[]) => {
		onFilterChange({ ...filter, actions: actions as ActionState[] });
	}, [filter, onFilterChange]);

	const handleOutfitsChange = useCallback((outfits: string[]) => {
		onFilterChange({ ...filter, outfits });
	}, [filter, onFilterChange]);

	const handleClearAll = useCallback(() => {
		onFilterChange({});
	}, [onFilterChange]);

	const getViewLabel = useCallback((view: string) => {
		return t(`assetLibrary.filter.view.${view}` as const) || view;
	}, [t]);

	const getExpressionLabel = useCallback((expression: string) => {
		return t(`assetLibrary.filter.expression.${expression}` as const) || expression;
	}, [t]);

	const getActionLabel = useCallback((action: string) => {
		return t(`assetLibrary.filter.action.${action}` as const) || action;
	}, [t]);

	return (
		<div
			className="border-b"
			style={{ borderColor: 'var(--vscode-sideBarSectionHeader-border)' }}
		>
			{/* Header */}
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-2 py-1.5 flex items-center justify-between text-xs"
				style={{ color: 'var(--vscode-foreground)' }}
			>
				<div className="flex items-center gap-1.5">
					<svg
						className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
					</svg>
					<span>{t('assetLibrary.filter.title')}</span>
					{activeFilterCount > 0 && (
						<span
							className="px-1.5 py-0.5 rounded-full text-xs"
							style={{
								backgroundColor: 'var(--vscode-badge-background)',
								color: 'var(--vscode-badge-foreground)',
							}}
						>
							{activeFilterCount}
						</span>
					)}
				</div>
				{activeFilterCount > 0 && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							handleClearAll();
						}}
						className="text-xs px-1.5 py-0.5 rounded"
						style={{ color: 'var(--vscode-textLink-foreground)' }}
						onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)'}
						onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
					>
						{t('assetLibrary.filter.clearAll')}
					</button>
				)}
			</button>

			{/* Expanded Content */}
			{isExpanded && (
				<div className="px-2 pb-2 space-y-3">
					{/* View Filter */}
					<FilterSection
						title={t('assetLibrary.filter.viewTitle')}
						options={VIEW_OPTIONS}
						selected={filter.views ?? []}
						onChange={handleViewsChange}
						getLabel={getViewLabel}
					/>

					{/* Expression Filter */}
					<FilterSection
						title={t('assetLibrary.filter.expressionTitle')}
						options={EXPRESSION_OPTIONS}
						selected={filter.expressions ?? []}
						onChange={handleExpressionsChange}
						getLabel={getExpressionLabel}
					/>

					{/* Action Filter */}
					<FilterSection
						title={t('assetLibrary.filter.actionTitle')}
						options={ACTION_OPTIONS}
						selected={filter.actions ?? []}
						onChange={handleActionsChange}
						getLabel={getActionLabel}
					/>

					{/* Outfit Filter (only show if outfits available) */}
					{availableOutfits.length > 0 && (
						<FilterSection
							title={t('assetLibrary.filter.outfitTitle')}
							options={availableOutfits}
							selected={filter.outfits ?? []}
							onChange={handleOutfitsChange}
						/>
					)}
				</div>
			)}
		</div>
	);
});
