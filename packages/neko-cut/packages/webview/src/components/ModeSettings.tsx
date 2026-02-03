/**
 * Mode Settings Panel
 *
 * Displays compatible mode status and triggers download.
 * Only compatible mode is supported (Native FFmpeg + wgpu via NAPI).
 */

import { memo, useCallback } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { useEditorStore } from '../stores/editor-store';

interface ModeSettingsProps {
	className?: string;
}

export const ModeSettings = memo(function ModeSettings({ className = '' }: ModeSettingsProps) {
	const { t } = useTranslation();

	const currentMode = useEditorStore((state) => state.currentMode);
	const compatibleModeInstalled = useEditorStore((state) => state.compatibleModeInstalled);
	const downloadStatus = useEditorStore((state) => state.downloadStatus);
	const isModeLoading = useEditorStore((state) => state.isModeLoading);
	const modeError = useEditorStore((state) => state.modeError);
	const startCompatibleModeDownload = useEditorStore((state) => state.startCompatibleModeDownload);

	const handleDownload = useCallback(() => {
		startCompatibleModeDownload();
	}, [startCompatibleModeDownload]);

	const formatSize = (bytes?: number) => {
		if (!bytes) return '';
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	};

	const isDownloading =
		downloadStatus.state === 'downloading' ||
		downloadStatus.state === 'extracting' ||
		downloadStatus.state === 'verifying';

	return (
		<div className={`space-y-4 ${className}`}>
			{/* Section Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-[var(--vscode-foreground)]">
					{t('mediaEngine.settings.title')}
				</h3>
				{currentMode && (
					<span
						className="text-xs px-2 py-0.5 rounded"
						style={{
							backgroundColor: 'var(--vscode-badge-background)',
							color: 'var(--vscode-badge-foreground)',
						}}
					>
						{t(`mediaEngine.mode.${currentMode}`)}
					</span>
				)}
			</div>

			{/* Compatible Mode Status */}
			<div
				className="space-y-2 p-3 rounded"
				style={{
					backgroundColor: 'var(--vscode-input-background)',
					border: '1px solid var(--vscode-panel-border)',
				}}
			>
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium">{t('mediaEngine.settings.compatibleMode')}</span>
					<span
						className="text-xs"
						style={{
							color: compatibleModeInstalled
								? 'var(--vscode-testing-iconPassed)'
								: 'var(--vscode-descriptionForeground)',
						}}
					>
						{compatibleModeInstalled
							? t('mediaEngine.status.installed')
							: t('mediaEngine.status.notInstalled')}
					</span>
				</div>

				{compatibleModeInstalled ? (
					<div className="text-xs text-[var(--vscode-descriptionForeground)]">
						{downloadStatus.version && (
							<span>
								{t('mediaEngine.status.version')}: {downloadStatus.version}
							</span>
						)}
						{downloadStatus.size && <span className="ml-2">({formatSize(downloadStatus.size)})</span>}
					</div>
				) : (
					<div className="space-y-2">
						<p className="text-xs text-[var(--vscode-descriptionForeground)]">
							{t('mediaEngine.settings.downloadDescription')}
						</p>

						{downloadStatus.state === 'idle' && (
							<button
								onClick={handleDownload}
								disabled={isModeLoading}
								className="px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50"
								style={{
									backgroundColor: 'var(--vscode-button-background)',
									color: 'var(--vscode-button-foreground)',
								}}
							>
								{t('mediaEngine.action.download')} (~20 MB)
							</button>
						)}

						{isDownloading && (
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<div
										className="flex-1 h-1.5 rounded overflow-hidden"
										style={{ backgroundColor: 'var(--vscode-panel-border)' }}
									>
										<div
											className="h-full transition-all duration-300"
											style={{
												width: `${downloadStatus.progress ?? 0}%`,
												backgroundColor: 'var(--vscode-button-background)',
											}}
										/>
									</div>
									<span className="text-xs text-[var(--vscode-descriptionForeground)]">
										{Math.round(downloadStatus.progress ?? 0)}%
									</span>
								</div>
								<p className="text-xs text-[var(--vscode-descriptionForeground)]">
									{t(`mediaEngine.downloadState.${downloadStatus.state}`)}
								</p>
							</div>
						)}

						{downloadStatus.state === 'error' && (
							<div
								className="text-xs"
								style={{ color: 'var(--vscode-inputValidation-errorForeground)' }}
							>
								{downloadStatus.error || t('mediaEngine.error.downloadFailed')}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Error Display */}
			{modeError && (
				<div
					className="p-2 rounded text-xs"
					style={{
						backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
						border: '1px solid var(--vscode-inputValidation-errorBorder)',
						color: 'var(--vscode-inputValidation-errorForeground)',
					}}
				>
					{modeError}
				</div>
			)}
		</div>
	);
});

export default ModeSettings;
