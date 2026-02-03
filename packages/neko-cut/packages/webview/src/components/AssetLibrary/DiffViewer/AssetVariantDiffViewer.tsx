/**
 * Asset Variant Diff Viewer
 *
 * Main component for comparing two asset variants.
 * Combines attribute diff, media diff (via MediaDiff), and AI analysis.
 */

import { memo, useState } from 'react';
import type { AssetDiffViewerProps } from './types';
import { AttributeDiffPanel } from './AttributeDiffPanel';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { MediaDiffViewer } from '../../MediaDiff';
import { getCategoryInfo } from '../types';

export const AssetVariantDiffViewer = memo(function AssetVariantDiffViewer({
	entity,
	variantA,
	variantB,
	attributeDiffs = [],
	fileSimilarity,
	aiSummary,
	aiLoading,
	onRequestAIAnalysis,
	onClose,
}: AssetDiffViewerProps) {
	const [activeTab, setActiveTab] = useState<'media' | 'attributes' | 'ai'>('media');
	const categoryInfo = getCategoryInfo(entity.category);

	// Get primary files for media comparison
	const fileA = variantA.files[0];
	const fileB = variantB.files[0];
	const canCompareMedia = fileA && fileB;

	// Determine media type
	const getMediaType = (): 'image' | 'video' | 'audio' | undefined => {
		if (!fileA) return undefined;
		const ext = fileA.path.split('.').pop()?.toLowerCase() ?? '';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
		if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
		if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
		return 'image';
	};

	const mediaType = getMediaType();

	return (
		<div className="flex flex-col h-full bg-gray-900">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
				<div className="flex items-center gap-3">
					<span className="text-2xl">{categoryInfo.icon}</span>
					<div>
						<h2 className="text-lg font-semibold text-white">{entity.name}</h2>
						<p className="text-sm text-gray-400">
							对比: {variantA.name} ↔ {variantB.name}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{/* Similarity Badge */}
					{fileSimilarity !== undefined && (
						<div className="flex items-center gap-2">
							<span className="text-sm text-gray-400">相似度:</span>
							<span
								className={`font-medium ${
									fileSimilarity > 0.9
										? 'text-green-400'
										: fileSimilarity > 0.7
										? 'text-yellow-400'
										: 'text-red-400'
								}`}
							>
								{Math.round(fileSimilarity * 100)}%
							</span>
						</div>
					)}

					{/* Close Button */}
					{onClose && (
						<button
							className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
							onClick={onClose}
						>
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					)}
				</div>
			</div>

			{/* Tabs */}
			<div className="flex border-b border-gray-700">
				<button
					className={`px-4 py-2 text-sm font-medium transition-colors
						${activeTab === 'media'
							? 'text-blue-400 border-b-2 border-blue-400'
							: 'text-gray-400 hover:text-white'}`}
					onClick={() => setActiveTab('media')}
				>
					媒体对比
				</button>
				<button
					className={`px-4 py-2 text-sm font-medium transition-colors
						${activeTab === 'attributes'
							? 'text-blue-400 border-b-2 border-blue-400'
							: 'text-gray-400 hover:text-white'}`}
					onClick={() => setActiveTab('attributes')}
				>
					属性差异
					{attributeDiffs.length > 0 && (
						<span className="ml-1.5 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
							{attributeDiffs.length}
						</span>
					)}
				</button>
				<button
					className={`px-4 py-2 text-sm font-medium transition-colors
						${activeTab === 'ai'
							? 'text-blue-400 border-b-2 border-blue-400'
							: 'text-gray-400 hover:text-white'}`}
					onClick={() => setActiveTab('ai')}
				>
					🤖 AI 分析
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				{activeTab === 'media' && (
					<div className="h-full">
						{canCompareMedia ? (
							<MediaDiffViewer
								currentSrc={fileA.path}
								previousSrc={fileB.path}
								diffResult={{
									mediaType: mediaType ?? 'image',
									similarity: fileSimilarity ?? 1,
									details: {
										dimensions: {
											current: { width: 0, height: 0 },
											previous: { width: 0, height: 0 },
										},
										pixelDifference: 0,
										structuralSimilarity: fileSimilarity ?? 1,
										colorHistogramDiff: 0,
									},
								}}
							/>
						) : (
							<div className="h-full flex items-center justify-center text-gray-400">
								<div className="text-center">
									<p className="mb-2">无法进行媒体对比</p>
									<p className="text-sm">
										{!fileA && !fileB
											? '两个变体都没有文件'
											: !fileA
											? `${variantA.name} 没有文件`
											: `${variantB.name} 没有文件`}
									</p>
								</div>
							</div>
						)}
					</div>
				)}

				{activeTab === 'attributes' && (
					<div className="h-full overflow-y-auto p-4">
						<AttributeDiffPanel
							diffs={attributeDiffs}
							variantAName={variantA.name}
							variantBName={variantB.name}
						/>
					</div>
				)}

				{activeTab === 'ai' && (
					<div className="h-full overflow-y-auto p-4">
						<AIAnalysisPanel
							summary={aiSummary ?? null}
							isLoading={aiLoading}
							onRequestAnalysis={onRequestAIAnalysis}
						/>
					</div>
				)}
			</div>
		</div>
	);
});
