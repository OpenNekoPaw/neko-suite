/**
 * Asset Diff Viewer Types
 *
 * Types for asset-level diff viewing (variants, versions, AI analysis).
 */

import type { AssetEntity, AssetVariant, VariantAttributes, FileVersion } from '@neko/shared';

// =============================================================================
// Component Props
// =============================================================================

/** Main Asset Diff Viewer props */
export interface AssetDiffViewerProps {
	/** Entity being compared */
	entity: AssetEntity;
	/** First variant (or version) */
	variantA: AssetVariant;
	/** Second variant (or version) */
	variantB: AssetVariant;
	/** Attribute differences */
	attributeDiffs?: AttributeDiff[];
	/** File similarity score (0-1) */
	fileSimilarity?: number;
	/** AI comparison summary */
	aiSummary?: string;
	/** Whether AI analysis is loading */
	aiLoading?: boolean;
	/** Called when requesting AI analysis */
	onRequestAIAnalysis?: () => void;
	/** Called when closing the viewer */
	onClose?: () => void;
}

/** Version History Panel props */
export interface VersionHistoryPanelProps {
	/** File path */
	filePath: string;
	/** Available versions */
	versions: FileVersion[];
	/** Currently selected version */
	selectedVersion: string | null;
	/** Called when version is selected */
	onVersionSelect: (commitHash: string) => void;
	/** Whether loading */
	isLoading?: boolean;
}

/** Attribute Diff Panel props */
export interface AttributeDiffPanelProps {
	/** Attribute differences */
	diffs: AttributeDiff[];
	/** Variant A name */
	variantAName: string;
	/** Variant B name */
	variantBName: string;
}

/** AI Analysis Panel props */
export interface AIAnalysisPanelProps {
	/** AI summary text */
	summary: string | null;
	/** Whether loading */
	isLoading?: boolean;
	/** Called when requesting analysis */
	onRequestAnalysis?: () => void;
}

// =============================================================================
// Data Types
// =============================================================================

/** Attribute difference */
export interface AttributeDiff {
	attribute: keyof VariantAttributes;
	valueA: string | undefined;
	valueB: string | undefined;
}

// =============================================================================
// Attribute Labels
// =============================================================================

export const ATTRIBUTE_LABELS: Record<keyof VariantAttributes, string> = {
	view: '视角',
	expression: '表情',
	action: '动作',
	texture: '纹理',
	outfit: '服装',
	lighting: '光照',
	timeOfDay: '时间',
	weather: '天气',
	custom: '自定义',
};

export function getAttributeLabel(attr: keyof VariantAttributes): string {
	return ATTRIBUTE_LABELS[attr] ?? attr;
}
