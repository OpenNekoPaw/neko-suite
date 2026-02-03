/**
 * Media Engine Mode Types
 *
 * Defines the runtime modes for the progressive media processing architecture.
 */
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
export type MediaEngineState = 'uninitialized' | 'initializing' | 'ready' | 'error' | 'disposed';
/**
 * Mode selection preference
 */
export type ModePreference = 'auto' | 'basic' | 'compatible';
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
/**
 * Video codecs supported by basic mode (WebCodecs)
 */
export declare const BASIC_MODE_VIDEO_CODECS: readonly ["h264", "vp8", "vp9"];
/**
 * Audio codecs supported by basic mode (FFmpeg.wasm + Web Audio)
 */
export declare const BASIC_MODE_AUDIO_CODECS: readonly ["aac", "mp3", "opus", "vorbis", "flac", "pcm"];
/**
 * Container formats supported by basic mode
 */
export declare const BASIC_MODE_CONTAINERS: readonly ["mp4", "webm", "ogg", "mov"];
/**
 * Check if a video codec is supported by basic mode
 */
export declare function isBasicModeVideoCodec(codec: string): boolean;
/**
 * Check if an audio codec is supported by basic mode
 */
export declare function isBasicModeAudioCodec(codec: string): boolean;
/**
 * Check if a container format is supported by basic mode
 */
export declare function isBasicModeContainer(container: string): boolean;
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
//# sourceMappingURL=mode.d.ts.map