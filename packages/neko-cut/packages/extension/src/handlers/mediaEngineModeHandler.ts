/**
 * Media Engine Mode Handler
 *
 * Handles mode-related messages from Webview.
 * Routes messages to MediaEngineManager for processing.
 *
 * Message Types:
 * - mediaEngine:getMode          : Get current mode and status
 * - mediaEngine:setMode          : Set mode preference
 * - mediaEngine:getDownloadStatus: Get compatible mode download status
 * - mediaEngine:startDownload    : Start compatible mode download
 * - mediaEngine:analyzeMedia     : Analyze media and get mode recommendation
 */

import type {
	MediaEngineMode,
	ModePreference,
	ModeSelectionResult,
	DownloadStatus,
	ResolveAutoModeContext,
	TimelineMediaAnalysisResult,
} from '@uniedit/shared';
import type { MediaEngineManager } from '../mediaEngine/MediaEngineManager';

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
 * Set mode request (extended with context support)
 */
interface SetModeRequest extends BaseRequest {
	type: 'mediaEngine:setMode';
	payload: {
		mode: ModePreference;
		/** Context for auto mode resolution */
		context?: ResolveAutoModeContext;
		/** Media paths from timeline (for editor context) */
		mediaPaths?: string[];
		/** Project directory for resolving relative paths */
		projectDir?: string;
	};
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
 * Analyze media request
 */
interface AnalyzeMediaRequest extends BaseRequest {
	type: 'mediaEngine:analyzeMedia';
	payload: {
		videoPath: string;
	};
}

/**
 * Resolve auto mode request (for context-aware mode selection)
 */
interface ResolveAutoModeRequest extends BaseRequest {
	type: 'mediaEngine:resolveAutoMode';
	payload: {
		context: ResolveAutoModeContext;
		mediaPaths?: string[];
		projectDir?: string;
	};
}

/**
 * Media engine message union type
 */
export type MediaEngineModeMessage =
	| GetModeRequest
	| SetModeRequest
	| GetDownloadStatusRequest
	| StartDownloadRequest
	| AnalyzeMediaRequest
	| ResolveAutoModeRequest;

/**
 * Response types
 */
interface GetModeResponse {
	type: 'mediaEngine:response:getMode';
	requestId?: string;
	payload?: {
		currentMode: MediaEngineMode | null;
		compatibleModeInstalled: boolean;
	};
	error?: string;
}

interface SetModeResponse {
	type: 'mediaEngine:response:setMode';
	requestId?: string;
	payload?: {
		success: boolean;
		activeMode: MediaEngineMode | null;
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

interface AnalyzeMediaResponse {
	type: 'mediaEngine:response:analyzeMedia';
	requestId?: string;
	payload?: ModeSelectionResult & {
		mediaInfo?: unknown;
	};
	error?: string;
}

interface ResolveAutoModeResponse {
	type: 'mediaEngine:response:resolveAutoMode';
	requestId?: string;
	payload?: {
		resolvedMode: MediaEngineMode;
		analysis?: TimelineMediaAnalysisResult;
		requiresDownload?: boolean;
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
	| SetModeResponse
	| GetDownloadStatusResponse
	| StartDownloadResponse
	| AnalyzeMediaResponse
	| ResolveAutoModeResponse
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

			case 'mediaEngine:setMode':
				return handleSetMode(requestId, message.payload, postMessage, manager);

			case 'mediaEngine:getDownloadStatus':
				return handleGetDownloadStatus(requestId, postMessage, manager);

			case 'mediaEngine:startDownload':
				return handleStartDownload(requestId, postMessage, manager);

			case 'mediaEngine:analyzeMedia':
				return handleAnalyzeMedia(requestId, message.payload.videoPath, postMessage, manager);

			case 'mediaEngine:resolveAutoMode':
				return handleResolveAutoMode(requestId, message.payload, postMessage, manager);

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

async function handleSetMode(
	requestId: string | undefined,
	payload: SetModeRequest['payload'],
	postMessage: PostMessageFn,
	manager: MediaEngineManager
): Promise<boolean> {
	const { mode, context, mediaPaths, projectDir } = payload;

	try {
		// Handle 'auto' mode - use context-aware resolution
		if (mode === 'auto') {
			// If context is provided, use resolveAutoMode
			if (context) {
				const autoMode = await manager.resolveAutoMode(context, mediaPaths, projectDir);
				postMessage({
					type: 'mediaEngine:response:setMode',
					requestId,
					payload: {
						success: true,
						activeMode: autoMode,
					},
				});
				return true;
			}

			// Fallback to legacy behavior (non-editor, use autoSelectedMode)
			const autoMode = manager.autoSelectedMode;
			postMessage({
				type: 'mediaEngine:response:setMode',
				requestId,
				payload: {
					success: true,
					activeMode: autoMode,
				},
			});
			return true;
		}

		// Force specific mode
		await manager.forceMode(mode);

		postMessage({
			type: 'mediaEngine:response:setMode',
			requestId,
			payload: {
				success: true,
				activeMode: manager.currentMode,
			},
		});
	} catch (error) {
		postMessage({
			type: 'mediaEngine:response:setMode',
			requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
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

async function handleAnalyzeMedia(
	requestId: string | undefined,
	videoPath: string,
	postMessage: PostMessageFn,
	manager: MediaEngineManager
): Promise<boolean> {
	try {
		const { mediaInfo, recommendation } = await manager.probeMediaWithRecommendation(videoPath);

		postMessage({
			type: 'mediaEngine:response:analyzeMedia',
			requestId,
			payload: {
				...recommendation,
				mediaInfo,
			},
		});
	} catch (error) {
		postMessage({
			type: 'mediaEngine:response:analyzeMedia',
			requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
	return true;
}

/**
 * Handle resolveAutoMode request
 * Resolves auto mode based on context (editor vs non-editor)
 */
async function handleResolveAutoMode(
	requestId: string | undefined,
	payload: ResolveAutoModeRequest['payload'],
	postMessage: PostMessageFn,
	manager: MediaEngineManager
): Promise<boolean> {
	const { context, mediaPaths, projectDir } = payload;

	try {
		// Resolve the mode based on context
		const resolvedMode = await manager.resolveAutoMode(context, mediaPaths, projectDir);

		// Get analysis for editor context
		let analysis: TimelineMediaAnalysisResult | undefined;
		if (context === 'editor' && mediaPaths && mediaPaths.length > 0) {
			analysis = await manager.analyzeTimelineMedia(mediaPaths, projectDir);
		}

		// Check if download is required for compatible mode
		const requiresDownload = resolvedMode === 'compatible' && !manager.isCompatibleModeInstalled;

		postMessage({
			type: 'mediaEngine:response:resolveAutoMode',
			requestId,
			payload: {
				resolvedMode,
				analysis,
				requiresDownload,
			},
		});
	} catch (error) {
		postMessage({
			type: 'mediaEngine:response:resolveAutoMode',
			requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
	return true;
}
