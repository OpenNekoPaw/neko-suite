/**
 * AI Analysis Panel
 *
 * Displays AI-generated analysis of asset differences.
 */

import { memo } from 'react';
import type { AIAnalysisPanelProps } from './types';

export const AIAnalysisPanel = memo(function AIAnalysisPanel({
	summary,
	isLoading,
	onRequestAnalysis,
}: AIAnalysisPanelProps) {
	if (isLoading) {
		return (
			<div className="p-4 bg-gray-800 rounded-lg">
				<div className="flex items-center gap-3">
					<div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
					<span className="text-gray-300">AI 正在分析差异...</span>
				</div>
			</div>
		);
	}

	if (!summary) {
		return (
			<div className="p-4 bg-gray-800 rounded-lg">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-gray-400">
						<span>🤖</span>
						<span>AI 差异分析</span>
					</div>
					{onRequestAnalysis && (
						<button
							className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
							onClick={onRequestAnalysis}
						>
							开始分析
						</button>
					)}
				</div>
				<p className="mt-2 text-sm text-gray-500">
					AI 可以帮助分析两个版本之间的视觉差异，识别内容变化并生成描述。
				</p>
			</div>
		);
	}

	return (
		<div className="p-4 bg-gray-800 rounded-lg">
			<div className="flex items-center gap-2 text-purple-400 mb-3">
				<span>🤖</span>
				<span className="font-medium">AI 分析结果</span>
			</div>
			<div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
				{summary}
			</div>
			{onRequestAnalysis && (
				<button
					className="mt-3 text-xs text-purple-400 hover:text-purple-300"
					onClick={onRequestAnalysis}
				>
					重新分析
				</button>
			)}
		</div>
	);
});
