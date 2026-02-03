/**
 * Media Engine Mode Types
 *
 * Defines the runtime modes for the progressive media processing architecture.
 */

// =============================================================================
// Engine Mode
// =============================================================================

/**
 * Media engine runtime mode
 *
 * - basic: WebCodecs + FFmpeg.wasm + WebGPU (runs in Webview)
 * - compatible: Native FFmpeg + wgpu (runs in Extension Host)
 */
export type MediaEngineMode = 'basic' | 'compatible';

/**
 * Media engine state
 */
export type MediaEngineState =
	| 'uninitialized'
	| 'initializing'
	| 'ready'
	| 'error'
	| 'disposed';

/**
 * Mode selection preference
 */
export type ModePreference = 'auto' | 'basic' | 'compatible';

// =============================================================================
// Mode Selection
// =============================================================================

/**
 * Mode selection result
 */
export interface ModeSelectionResult {
	/** Recommended mode */
	recommendedMode: MediaEngineMode;
	/** Selection reason */
	reason: string;
	/** Whether compatible mode download is required */
	requiresDownload: boolean;
	/** Download size in bytes (if download required) */
	downloadSize?: number;
	/** Unsupported features in basic mode (if any) */
	unsupportedFeatures?: string[];
}

/**
 * Download status for compatible mode components
 */
export interface DownloadStatus {
	/** Whether compatible mode is installed */
	installed: boolean;
	/** Installed version (if installed) */
	version?: string;
	/** Installed size in bytes (if installed) */
	size?: number;
	/** Download progress (0-100, if downloading) */
	progress?: number;
	/** Download state */
	state: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'completed' | 'error';
	/** Error message (if state is error) */
	error?: string;
}

// =============================================================================
// Basic Mode Supported Formats
// =============================================================================

/**
 * Video codecs supported by basic mode (WebCodecs)
 */
export const BASIC_MODE_VIDEO_CODECS = ['h264', 'vp8', 'vp9'] as const;

/**
 * Audio codecs supported by basic mode (FFmpeg.wasm + Web Audio)
 */
export const BASIC_MODE_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm'] as const;

/**
 * Container formats supported by basic mode
 */
export const BASIC_MODE_CONTAINERS = ['mp4', 'webm', 'ogg', 'mov'] as const;

/**
 * Check if a video codec is supported by basic mode
 */
export function isBasicModeVideoCodec(codec: string): boolean {
	return BASIC_MODE_VIDEO_CODECS.includes(codec.toLowerCase() as typeof BASIC_MODE_VIDEO_CODECS[number]);
}

/**
 * Check if an audio codec is supported by basic mode
 */
export function isBasicModeAudioCodec(codec: string): boolean {
	return BASIC_MODE_AUDIO_CODECS.includes(codec.toLowerCase() as typeof BASIC_MODE_AUDIO_CODECS[number]);
}

/**
 * Check if a container format is supported by basic mode
 */
export function isBasicModeContainer(container: string): boolean {
	return BASIC_MODE_CONTAINERS.includes(container.toLowerCase() as typeof BASIC_MODE_CONTAINERS[number]);
}

// =============================================================================
// Decoding Mode (Webview)
// =============================================================================

/**
 * Video decoding mode in Webview
 *
 * - webview: Pure Webview decoding using WebCodecs + mp4box.js (Zero-Copy)
 * - compatible: Prompt user to switch to compatible mode for unsupported formats
 *
 * Note: IPC mode has been removed. When WebCodecs doesn't support a format,
 * the user should switch to compatible mode (Extension Host) for full format support.
 */
export type DecodingMode = 'webview';

/**
 * Decoding mode configuration
 */
export interface DecodingModeConfig {
	/** Decoding mode (currently only 'webview' is supported) */
	mode: DecodingMode;
	/** Whether to prefer hardware acceleration */
	preferHardwareAcceleration?: boolean;
	/** Maximum decoder instances */
	maxDecoderInstances?: number;
	/** Frame buffer size per decoder */
	frameBufferSize?: number;
	/** Callback when format is not supported in basic mode */
	onFormatNotSupported?: (error: BasicModeFormatError) => void;
}

/**
 * Basic mode format error
 */
export interface BasicModeFormatError {
	/** Error type */
	type: 'codec_not_supported' | 'webcodecs_unavailable' | 'file_access_denied' | 'demux_failed';
	/** Error message */
	message: string;
	/** Suggestion for user */
	suggestion: string;
	/** Additional details */
	details?: string;
	/** Codec that caused the error (if applicable) */
	codec?: string;
}

// =============================================================================
// Auto Mode Context-Aware Selection
// =============================================================================

/**
 * Context for resolving auto mode
 *
 * - editor: Running inside video editor with timeline project
 * - non-editor: AI chat, external API calls, etc.
 */
export type ResolveAutoModeContext = 'editor' | 'non-editor';

/**
 * Result of analyzing timeline media for mode selection
 */
export interface TimelineMediaAnalysisResult {
	/** Whether all media files support basic mode */
	allSupportBasic: boolean;
	/** Files that don't support basic mode */
	unsupportedFiles: Array<{
		/** File path */
		path: string;
		/** Reason why basic mode is not supported */
		reason: string;
		/** Video codec (if applicable) */
		videoCodec?: string;
		/** Audio codec (if applicable) */
		audioCodec?: string;
	}>;
	/** Total number of media files analyzed */
	totalFiles: number;
	/** Number of files that support basic mode */
	supportedCount: number;
}
