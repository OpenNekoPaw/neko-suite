/**
 * Media Engine Mode Handler
 *
 * Handles mode-related messages from Webview.
 * Routes messages to MediaEngineManager for processing.
 *
 * Only compatible mode is supported (Native FFmpeg + wgpu via NAPI).
 *
 * Message Types:
 * - mediaEngine:getMode          : Get current mode and status
 * - mediaEngine:getDownloadStatus: Get compatible mode download status
 * - mediaEngine:startDownload    : Start compatible mode download
 */

import type {
	MediaEngineMode,
	DownloadStatus,
} from '@neko/shared';

// MediaEngineManager interface (provided by neko-engine extension)
// Using interface instead of direct import for loose coupling
interface IMediaEngineManager {
	currentMode: MediaEngineMode;
	isCompatibleModeInstalled: boolean;
	getDownloadStatus(): DownloadStatus;
	downloadCompatibleMode(onProgress: (percent: number) => void): Promise<void>;
}

type MediaEngineManager = IMediaEngineManager;

// =============================================================================
// Types
// =============================================================================

/**
 * Base request interface
 */
interface BaseRequest {
	type: string;
	requestId?: string;
	timestamp?: number;
}

/**
 * Get mode request
 */
interface GetModeRequest extends BaseRequest {
	type: 'mediaEngine:getMode';
}

/**
 * Get download status request
 */
interface GetDownloadStatusRequest extends BaseRequest {
	type: 'mediaEngine:getDownloadStatus';
}

/**
 * Start download request
 */
interface StartDownloadRequest extends BaseRequest {
	type: 'mediaEngine:startDownload';
}

/**
 * Media engine message union type
 */
export type MediaEngineModeMessage =
	| GetModeRequest
	| GetDownloadStatusRequest
	| StartDownloadRequest;

/**
 * Response types
 */
interface GetModeResponse {
	type: 'mediaEngine:response:getMode';
	requestId?: string;
	payload?: {
		currentMode: MediaEngineMode;
		compatibleModeInstalled: boolean;
	};
	error?: string;
}

interface GetDownloadStatusResponse {
	type: 'mediaEngine:response:getDownloadStatus';
	requestId?: string;
	payload?: DownloadStatus;
	error?: string;
}

interface StartDownloadResponse {
	type: 'mediaEngine:response:startDownload';
	requestId?: string;
	payload?: {
		started: boolean;
	};
	error?: string;
}

interface DownloadProgressNotification {
	type: 'mediaEngine:downloadProgress';
	payload: {
		progress: number;
		state: DownloadStatus['state'];
	};
}

interface DownloadCompleteNotification {
	type: 'mediaEngine:downloadComplete';
	payload: {
		success: boolean;
		error?: string;
		version?: string;
	};
}

type MediaEngineModeResponse =
	| GetModeResponse
	| GetDownloadStatusResponse
	| StartDownloadResponse
	| DownloadProgressNotification
	| DownloadCompleteNotification;

/**
 * Post message function type
 */
type PostMessageFn = (response: MediaEngineModeResponse) => void;

// =============================================================================
// Handler
// =============================================================================

/**
 * Check if message is a media engine mode message
 */
export function isMediaEngineModeMessage(message: unknown): message is MediaEngineModeMessage {
	if (!message || typeof message !== 'object') return false;
	const msg = message as { type?: string };
	return typeof msg.type === 'string' && msg.type.startsWith('mediaEngine:');
}

/**
 * Handle media engine mode messages from Webview
 */
export async function handleMediaEngineModeMessage(
	message: MediaEngineModeMessage,
	postMessage: PostMessageFn,
	manager: MediaEngineManager | null
): Promise<boolean> {
	if (!manager) {
		console.warn('[MediaEngineModeHandler] Manager not available');
		return false;
	}

	const requestId = message.requestId;

	try {
		switch (message.type) {
			case 'mediaEngine:getMode':
				return handleGetMode(requestId, postMessage, manager);

			case 'mediaEngine:getDownloadStatus':
				return handleGetDownloadStatus(requestId, postMessage, manager);

			case 'mediaEngine:startDownload':
				return handleStartDownload(requestId, postMessage, manager);

			default:
				return false;
		}
	} catch (error) {
		console.error('[MediaEngineModeHandler] Error:', error);
		return false;
	}
}

// =============================================================================
// Individual Handlers
// =============================================================================

async function handleGetMode(
	requestId: string | undefined,
	postMessage: PostMessageFn,
	manager: MediaEngineManager
): Promise<boolean> {
	postMessage({
		type: 'mediaEngine:response:getMode',
		requestId,
		payload: {
			currentMode: manager.currentMode,
			compatibleModeInstalled: manager.isCompatibleModeInstalled,
		},
	});
	return true;
}

async function handleGetDownloadStatus(
	requestId: string | undefined,
	postMessage: PostMessageFn,
	manager: MediaEngineManager
): Promise<boolean> {
	const status = manager.getDownloadStatus();
	postMessage({
		type: 'mediaEngine:response:getDownloadStatus',
		requestId,
		payload: status,
	});
	return true;
}

async function handleStartDownload(
	requestId: string | undefined,
	postMessage: PostMessageFn,
	manager: MediaEngineManager
): Promise<boolean> {
	try {
		// Start download and send progress notifications
		await manager.downloadCompatibleMode((percent) => {
			postMessage({
				type: 'mediaEngine:downloadProgress',
				payload: {
					progress: percent,
					state: 'downloading',
				},
			});
		});

		// Send success response
		postMessage({
			type: 'mediaEngine:response:startDownload',
			requestId,
			payload: { started: true },
		});

		// Send completion notification
		const status = manager.getDownloadStatus();
		postMessage({
			type: 'mediaEngine:downloadComplete',
			payload: {
				success: true,
				version: status.version,
			},
		});
	} catch (error) {
		postMessage({
			type: 'mediaEngine:response:startDownload',
			requestId,
			payload: { started: false },
			error: error instanceof Error ? error.message : String(error),
		});

		postMessage({
			type: 'mediaEngine:downloadComplete',
			payload: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
	return true;
}
