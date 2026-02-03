/**
 * Version History Panel
 *
 * Displays Git version history for an asset file.
 */

import { memo } from 'react';
import type { VersionHistoryPanelProps } from './types';

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
	filePath,
	versions,
	selectedVersion,
	onVersionSelect,
	isLoading,
}: VersionHistoryPanelProps) {
	if (isLoading) {
		return (
			<div className="p-4 flex items-center justify-center">
				<div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
			</div>
		);
	}

	if (versions.length === 0) {
		return (
			<div className="p-4 text-center text-gray-400 text-sm">
				没有找到版本历史
			</div>
		);
	}

	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return '今天';
		if (diffDays === 1) return '昨天';
		if (diffDays < 7) return `${diffDays}天前`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
		return date.toLocaleDateString('zh-CN');
	};

	const getChangeTypeIcon = (type: string) => {
		switch (type) {
			case 'added':
				return '➕';
			case 'modified':
				return '✏️';
			case 'renamed':
				return '📝';
			case 'deleted':
				return '🗑️';
			default:
				return '•';
		}
	};

	return (
		<div className="space-y-1">
			{/* File path header */}
			<div className="px-3 py-2 text-xs text-gray-500 truncate" title={filePath}>
				{filePath}
			</div>

			{/* Current (HEAD) */}
			<button
				className={`w-full text-left px-3 py-2 rounded transition-colors
					${selectedVersion === null
						? 'bg-blue-600 text-white'
						: 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
				onClick={() => onVersionSelect('')}
			>
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono bg-gray-700 px-1.5 py-0.5 rounded">HEAD</span>
					<span className="text-sm">当前版本</span>
				</div>
			</button>

			{/* Version list */}
			{versions.map((version) => (
				<button
					key={version.commitHash}
					className={`w-full text-left px-3 py-2 rounded transition-colors
						${selectedVersion === version.commitHash
							? 'bg-blue-600 text-white'
							: 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
					onClick={() => onVersionSelect(version.commitHash)}
				>
					<div className="flex items-center gap-2">
						<span>{getChangeTypeIcon(version.changeType)}</span>
						<span className="text-xs font-mono bg-gray-700 px-1.5 py-0.5 rounded">
							{version.shortHash}
						</span>
						<span className="text-xs text-gray-400">{formatDate(version.timestamp)}</span>
					</div>
					<div className="mt-1 text-xs text-gray-400 truncate" title={version.message}>
						{version.message}
					</div>
					<div className="text-xs text-gray-500">{version.author}</div>
				</button>
			))}
		</div>
	);
});
