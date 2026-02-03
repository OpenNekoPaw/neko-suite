/**
 * Attribute Diff Panel
 *
 * Displays attribute differences between two variants.
 */

import { memo } from 'react';
import type { AttributeDiffPanelProps } from './types';
import { getAttributeLabel } from './types';

export const AttributeDiffPanel = memo(function AttributeDiffPanel({
	diffs,
	variantAName,
	variantBName,
}: AttributeDiffPanelProps) {
	if (diffs.length === 0) {
		return (
			<div className="p-4 text-center text-gray-400 text-sm">
				两个变体的属性完全相同
			</div>
		);
	}

	return (
		<div className="border border-gray-700 rounded-lg overflow-hidden">
			{/* Header */}
			<div className="grid grid-cols-3 bg-gray-800 text-sm font-medium text-gray-300">
				<div className="px-3 py-2 border-r border-gray-700">属性</div>
				<div className="px-3 py-2 border-r border-gray-700 truncate" title={variantAName}>
					{variantAName}
				</div>
				<div className="px-3 py-2 truncate" title={variantBName}>
					{variantBName}
				</div>
			</div>

			{/* Rows */}
			{diffs.map((diff) => (
				<div
					key={diff.attribute}
					className="grid grid-cols-3 text-sm border-t border-gray-700"
				>
					<div className="px-3 py-2 border-r border-gray-700 text-gray-400">
						{getAttributeLabel(diff.attribute)}
					</div>
					<div className="px-3 py-2 border-r border-gray-700">
						{diff.valueA ? (
							<span className="text-red-400">{diff.valueA}</span>
						) : (
							<span className="text-gray-500 italic">未设置</span>
						)}
					</div>
					<div className="px-3 py-2">
						{diff.valueB ? (
							<span className="text-green-400">{diff.valueB}</span>
						) : (
							<span className="text-gray-500 italic">未设置</span>
						)}
					</div>
				</div>
			))}
		</div>
	);
});
