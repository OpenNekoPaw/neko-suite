/**
 * Category Tabs Component
 *
 * Tab bar for filtering assets by category.
 * Uses VSCode theme variables for consistent styling.
 */

import { memo } from 'react';
import { CATEGORY_INFO, type CategoryTabsProps } from './types';
import { useTranslation } from '@/i18n/I18nContext';

export const CategoryTabs = memo(function CategoryTabs({
	activeCategory,
	onCategoryChange,
}: CategoryTabsProps) {
	const { t } = useTranslation();

	const tabStyle = (isActive: boolean): React.CSSProperties => ({
		backgroundColor: isActive
			? 'var(--vscode-button-background)'
			: 'var(--vscode-button-secondaryBackground)',
		color: isActive
			? 'var(--vscode-button-foreground)'
			: 'var(--vscode-button-secondaryForeground)',
	});

	const hoverStyle = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
		if (!isActive) {
			e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
		}
	};

	const leaveStyle = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
		if (!isActive) {
			e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryBackground)';
		}
	};

	return (
		<div
			className="flex gap-1 px-2 py-1.5 overflow-x-auto"
			style={{ borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)' }}
		>
			{/* All category */}
			<button
				className="px-2 py-1 rounded text-xs whitespace-nowrap transition-colors"
				style={tabStyle(activeCategory === null)}
				onClick={() => onCategoryChange(null)}
				onMouseEnter={(e) => hoverStyle(e, activeCategory === null)}
				onMouseLeave={(e) => leaveStyle(e, activeCategory === null)}
			>
				{t('assetLibrary.category.all')}
			</button>

			{/* Category buttons */}
			{CATEGORY_INFO.map((cat) => (
				<button
					key={cat.id}
					className="px-2 py-1 rounded text-xs whitespace-nowrap transition-colors flex items-center gap-1"
					style={tabStyle(activeCategory === cat.id)}
					onClick={() => onCategoryChange(cat.id)}
					onMouseEnter={(e) => hoverStyle(e, activeCategory === cat.id)}
					onMouseLeave={(e) => leaveStyle(e, activeCategory === cat.id)}
				>
					<span>{cat.icon}</span>
					<span>{t(cat.labelKey)}</span>
				</button>
			))}
		</div>
	);
});
