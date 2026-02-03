/**
 * Comparison Panel Component
 *
 * Floating panel for displaying variant comparison results.
 * Integrates AssetVariantDiffViewer for detailed comparison.
 */

import { memo } from 'react';
import type { AssetEntity, AssetVariant } from '@uniedit/shared';
import { AssetVariantDiffViewer } from './DiffViewer/AssetVariantDiffViewer';
import type { AttributeDiff } from './DiffViewer/types';
import { useTranslation } from '@/i18n/I18nContext';

interface ComparisonPanelProps {
	/** Entity being compared */
	entity: AssetEntity;
	/** First variant */
	variantA: AssetVariant;
	/** Second variant */
	variantB: AssetVariant;
	/** Attribute differences */
	attributeDiffs: AttributeDiff[];
	/** File similarity score */
	fileSimilarity?: number;
	/** Called when panel is closed */
	onClose: () => void;
}

export const ComparisonPanel = memo(function ComparisonPanel({
	entity,
	variantA,
	variantB,
	attributeDiffs,
	fileSimilarity,
	onClose,
}: ComparisonPanelProps) {
	const { t } = useTranslation();

	return (
		<div
			className="fixed inset-0 flex items-center justify-center z-50"
			style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
		>
			<div
				className="rounded-lg shadow-xl w-[90vw] h-[85vh] flex flex-col overflow-hidden"
				style={{ backgroundColor: 'var(--vscode-editor-background)' }}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-4 py-3"
					style={{ borderBottom: '1px solid var(--vscode-widget-border)' }}
				>
					<div className="flex items-center gap-2">
						<svg
							className="w-5 h-5"
							style={{ color: 'var(--vscode-symbolIcon-functionForeground)' }}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
							/>
						</svg>
						<h3 className="text-sm font-medium">{t('assetLibrary.comparison.title')}</h3>
					</div>
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

				{/* Content */}
				<div className="flex-1 overflow-hidden">
					<AssetVariantDiffViewer
						entity={entity}
						variantA={variantA}
						variantB={variantB}
						attributeDiffs={attributeDiffs}
						fileSimilarity={fileSimilarity}
						onClose={onClose}
					/>
				</div>
			</div>
		</div>
	);
});
