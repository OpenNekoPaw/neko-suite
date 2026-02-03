/**
 * useCompatibleExport Hook
 *
 * React hook for compatible mode video export.
 * Uses native GPU compositor and FFmpeg encoding in Extension Host.
 *
 * Features:
 * - Start/cancel export
 * - Progress tracking
 * - Preview frame requests
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { postMessage } from '../utils/vscodeApi';
import type {
	CompatibleExportConfig,
	CompatibleExportProgress,
	CompatibleExportResult,
	MessageToWebview,
} from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface ExportState {
	/** Whether export is in progress */
	isExporting: boolean;
	/** Current export ID */
	exportId: string | null;
	/** Progress information */
	progress: CompatibleExportProgress | null;
	/** Export result (when complete) */
	result: CompatibleExportResult | null;
	/** Error message if any */
	error: string | null;
}

export interface UseCompatibleExportReturn {
	/** Current export state */
	state: ExportState;
	/** Start a new export */
	startExport: (config: CompatibleExportConfig) => void;
	/** Cancel current export */
	cancelExport: () => void;
	/** Request a preview frame at specific time */
	requestPreviewFrame: (time: number, width?: number, height?: number) => Promise<PreviewFrameData>;
	/** Reset state (clear results/errors) */
	reset: () => void;
}

export interface PreviewFrameData {
	/** Base64 encoded RGBA data */
	frameData: string;
	/** Frame width */
	width: number;
	/** Frame height */
	height: number;
	/** Timestamp in seconds */
	timestamp: number;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: ExportState = {
	isExporting: false,
	exportId: null,
	progress: null,
	result: null,
	error: null,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Generate unique export ID
 */
function generateExportId(): string {
	return `export_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Hook for compatible mode export
 */
export function useCompatibleExport(): UseCompatibleExportReturn {
	const [state, setState] = useState<ExportState>(initialState);

	// Track pending preview requests
	const pendingPreviewRequests = useRef<Map<string, {
		resolve: (data: PreviewFrameData) => void;
		reject: (error: Error) => void;
	}>>(new Map());

	// Listen for messages from Extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<MessageToWebview>) => {
			const message = event.data;

			switch (message.type) {
				case 'compatibleExportStarted':
					setState(prev => ({
						...prev,
						isExporting: true,
						exportId: message.exportId,
						progress: null,
						result: null,
						error: null,
					}));
					break;

				case 'compatibleExportProgress':
					setState(prev => {
						if (prev.exportId !== message.exportId) return prev;
						return {
							...prev,
							progress: message.progress,
						};
					});
					break;

				case 'compatibleExportResult':
					setState(prev => {
						if (prev.exportId !== message.exportId) return prev;
						return {
							...prev,
							isExporting: false,
							result: message.result,
							error: message.result.success ? null : message.result.error ?? 'Export failed',
						};
					});
					break;

				case 'compatibleExportCancelled':
					setState(prev => {
						if (prev.exportId !== message.exportId) return prev;
						return {
							...prev,
							isExporting: false,
							error: 'Export cancelled',
						};
					});
					break;

				case 'previewFrameReady': {
					const pending = pendingPreviewRequests.current.get(message.requestId);
					if (pending) {
						pending.resolve({
							frameData: message.frameData,
							width: message.width,
							height: message.height,
							timestamp: message.timestamp,
						});
						pendingPreviewRequests.current.delete(message.requestId);
					}
					break;
				}

				case 'previewFrameError': {
					const pending = pendingPreviewRequests.current.get(message.requestId);
					if (pending) {
						pending.reject(new Error(message.error));
						pendingPreviewRequests.current.delete(message.requestId);
					}
					break;
				}
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	/**
	 * Start export
	 */
	const startExport = useCallback((config: CompatibleExportConfig) => {
		if (state.isExporting) {
			console.warn('[useCompatibleExport] Export already in progress');
			return;
		}

		const exportId = generateExportId();

		setState(prev => ({
			...prev,
			isExporting: true,
			exportId,
			progress: null,
			result: null,
			error: null,
		}));

		postMessage({
			type: 'startCompatibleExport',
			exportId,
			config,
		});
	}, [state.isExporting]);

	/**
	 * Cancel export
	 */
	const cancelExport = useCallback(() => {
		if (!state.isExporting || !state.exportId) {
			return;
		}

		postMessage({
			type: 'cancelCompatibleExport',
			exportId: state.exportId,
		});
	}, [state.isExporting, state.exportId]);

	/**
	 * Request preview frame
	 */
	const requestPreviewFrame = useCallback((
		time: number,
		width?: number,
		height?: number
	): Promise<PreviewFrameData> => {
		return new Promise((resolve, reject) => {
			const requestId = `preview_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

			// Set timeout
			const timeout = setTimeout(() => {
				pendingPreviewRequests.current.delete(requestId);
				reject(new Error('Preview frame request timeout'));
			}, 10000);

			// Store pending request
			pendingPreviewRequests.current.set(requestId, {
				resolve: (data) => {
					clearTimeout(timeout);
					resolve(data);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});

			// Send request
			postMessage({
				type: 'requestPreviewFrame',
				requestId,
				time,
				width,
				height,
			});
		});
	}, []);

	/**
	 * Reset state
	 */
	const reset = useCallback(() => {
		setState(initialState);
	}, []);

	return {
		state,
		startExport,
		cancelExport,
		requestPreviewFrame,
		reset,
	};
}

export default useCompatibleExport;
