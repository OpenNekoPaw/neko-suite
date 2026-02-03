/**
 * Mode Indicator Badge
 *
 * Displays current media engine mode in the PreviewPanel.
 * Shows mode name and download progress if applicable.
 *
 * Modes:
 * - basic (green): WebCodecs + libav.js + WebGPU
 * - compatible (blue): Native FFmpeg + wgpu
 */

import { memo } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { useEditorStore } from '../stores/editor-store';

interface ModeIndicatorProps {
	className?: string;
}

export const ModeIndicator = memo(function ModeIndicator({ className = '' }: ModeIndicatorProps) {
	const { t } = useTranslation();
	const currentMode = useEditorStore((state) => state.currentMode);
	const downloadStatus = useEditorStore((state) => state.downloadStatus);

	// Don't render if mode not determined
	if (!currentMode) return null;

	// Mode configuration
	const modeConfig = {
		basic: {
			color: '#4a9', // Green - lightweight
			label: t('mediaEngine.mode.basic'),
			tooltip: t('mediaEngine.mode.basicTooltip'),
		},
		compatible: {
			color: '#49a', // Blue - full featured
			label: t('mediaEngine.mode.compatible'),
			tooltip: t('mediaEngine.mode.compatibleTooltip'),
		},
	};

	const config = modeConfig[currentMode];

	// Check if downloading
	const isDownloading =
		downloadStatus.state === 'downloading' ||
		downloadStatus.state === 'extracting' ||
		downloadStatus.state === 'verifying';

	return (
		<div
			className={`px-2 py-0.5 rounded text-xs font-mono opacity-60 hover:opacity-100 transition-opacity cursor-help ${className}`}
			style={{ backgroundColor: config.color, color: '#fff' }}
			title={config.tooltip}
		>
			<span>{config.label}</span>
			{isDownloading && (
				<span className="ml-1">({Math.round(downloadStatus.progress ?? 0)}%)</span>
			)}
		</div>
	);
});

export default ModeIndicator;
