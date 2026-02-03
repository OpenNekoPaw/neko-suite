/**
 * Media Diff Protocol
 *
 * Defines IPC protocol between Extension Host and Webview for media diff visualization.
 *
 * Responsibilities:
 * - Define request/response message types
 * - Define diff result structures for image/video/audio
 * - Ensure type-safe communication
 */
import type { MediaType } from './track';
export type { MediaType } from './track';
/**
 * Supported media file extensions
 */
export declare const MEDIA_EXTENSIONS: Record<string, MediaType>;
/**
 * Diff view modes
 */
export type DiffViewMode = 'side-by-side' | 'overlay' | 'slider' | 'onion-skin';
/**
 * Media file change status in Git
 */
export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';
/**
 * Media file change information
 */
export interface MediaFileChange {
    /** File URI */
    uri: string;
    /** Detected media type */
    mediaType: MediaType;
    /** Git change status */
    status: GitChangeStatus;
    /** Old URI for renamed files */
    oldUri?: string;
}
/**
 * File version pair for comparison
 */
export interface FileVersionPair {
    /** Current version (working copy or newer commit) */
    current: ArrayBuffer;
    /** Previous version (HEAD or older commit) */
    previous: ArrayBuffer;
    /** Current file path */
    currentPath: string;
    /** Previous file path */
    previousPath: string;
    /** Detected media type */
    mediaType: MediaType;
    /** Whether this is a new file (no previous version in Git) */
    isNewFile?: boolean;
}
/**
 * Diff analysis options
 */
export interface DiffOptions {
    /** Precision level (0-1, higher = more samples) */
    precision?: number;
    /** Generate visual heatmap for differences */
    generateHeatmap?: boolean;
    /** Maximum processing time in milliseconds */
    timeout?: number;
}
/**
 * Image diff details
 */
export interface ImageDiffDetails {
    /** Dimensions comparison */
    dimensions: {
        current: {
            width: number;
            height: number;
        };
        previous: {
            width: number;
            height: number;
        };
    };
    /** Pixel difference ratio (0-1) */
    pixelDifference: number;
    /** Structural similarity index (0-1, 1 = identical) */
    structuralSimilarity: number;
    /** Color histogram difference (0-1) */
    colorHistogramDiff: number;
}
/**
 * Keyframe comparison result
 */
export interface KeyframeDiff {
    /** Time position in seconds */
    time: number;
    /** Similarity score (0-1) */
    similarity: number;
}
/**
 * Video diff details
 */
export interface VideoDiffDetails {
    /** Duration comparison in seconds */
    duration: {
        current: number;
        previous: number;
    };
    /** Resolution comparison */
    resolution: {
        current: {
            width: number;
            height: number;
        };
        previous: {
            width: number;
            height: number;
        };
    };
    /** FPS comparison */
    fps: {
        current: number;
        previous: number;
    };
    /** Codec comparison */
    codec: {
        current: string;
        previous: string;
    };
    /** Keyframe-by-keyframe comparison */
    keyframeDiffs: KeyframeDiff[];
    /** Whether audio track changed */
    audioTrackChanged: boolean;
}
/**
 * Time range for silence detection
 */
export interface TimeRange {
    start: number;
    end: number;
}
/**
 * Audio diff details
 */
export interface AudioDiffDetails {
    /** Duration comparison in seconds */
    duration: {
        current: number;
        previous: number;
    };
    /** Sample rate comparison */
    sampleRate: {
        current: number;
        previous: number;
    };
    /** Channel count comparison */
    channels: {
        current: number;
        previous: number;
    };
    /** Waveform similarity (0-1) */
    waveformSimilarity: number;
    /** Spectral difference (0-1) */
    spectralDifference: number;
    /** Detected silence regions */
    silenceRegions?: {
        current: TimeRange[];
        previous: TimeRange[];
    };
}
/**
 * Diff visualization data
 */
export interface DiffVisualization {
    /** Heatmap image buffer (PNG) for image diff */
    heatmap?: ArrayBuffer;
    /** Current version waveform data points */
    currentWaveform?: number[];
    /** Previous version waveform data points */
    previousWaveform?: number[];
    /** Current keyframe images (JPEG buffers) */
    currentKeyframes?: ArrayBuffer[];
    /** Previous keyframe images (JPEG buffers) */
    previousKeyframes?: ArrayBuffer[];
}
/**
 * Complete diff result
 */
export interface DiffResult {
    /** Media type */
    mediaType: MediaType;
    /** Overall similarity score (0-1) */
    similarity: number;
    /** Type-specific details */
    details: ImageDiffDetails | VideoDiffDetails | AudioDiffDetails;
    /** Visualization data */
    visualization?: DiffVisualization;
}
/**
 * Base request structure
 */
interface BaseMediaDiffRequest {
    /** Unique request ID for response matching */
    requestId: string;
    /** Request timestamp */
    timestamp: number;
}
/**
 * Initialize diff request (Git-based comparison)
 */
export interface InitDiffRequest extends BaseMediaDiffRequest {
    type: 'mediaDiff:init';
    payload: {
        /** File URI to diff */
        fileUri: string;
        /** Git ref to compare against (default: HEAD) */
        ref?: string;
    };
}
/**
 * Initialize local file diff request (two local files comparison)
 */
export interface InitLocalDiffRequest extends BaseMediaDiffRequest {
    type: 'mediaDiff:initLocal';
    payload: {
        /** Current file URI (shown on the right) */
        currentUri: string;
        /** Previous file URI (shown on the left) */
        previousUri: string;
    };
}
/**
 * Change view mode request
 */
export interface SetViewModeRequest extends BaseMediaDiffRequest {
    type: 'mediaDiff:setViewMode';
    payload: {
        mode: DiffViewMode;
    };
}
/**
 * Seek to specific time (for video/audio)
 */
export interface SeekRequest extends BaseMediaDiffRequest {
    type: 'mediaDiff:seek';
    payload: {
        time: number;
    };
}
/**
 * Get frame at specific time (for video)
 */
export interface GetFrameRequest extends BaseMediaDiffRequest {
    type: 'mediaDiff:getFrame';
    payload: {
        time: number;
        version: 'current' | 'previous';
    };
}
/**
 * Cancel ongoing analysis
 */
export interface CancelAnalysisRequest extends BaseMediaDiffRequest {
    type: 'mediaDiff:cancel';
}
/**
 * All request types
 */
export type MediaDiffRequest = InitDiffRequest | InitLocalDiffRequest | SetViewModeRequest | SeekRequest | GetFrameRequest | CancelAnalysisRequest;
/**
 * Base response structure
 */
interface BaseMediaDiffResponse {
    /** Corresponding request ID */
    requestId?: string;
    /** Response type */
    type: string;
    /** Error message if failed */
    error?: string;
}
/**
 * Diff initialization result
 */
export interface DiffInitResponse extends BaseMediaDiffResponse {
    type: 'mediaDiff:initResult';
    payload?: {
        /** Media type detected */
        mediaType: MediaType;
        /** Current file path */
        currentPath: string;
        /** Previous file path/ref */
        previousRef: string;
    };
}
/**
 * Diff analysis progress
 */
export interface DiffProgressResponse extends BaseMediaDiffResponse {
    type: 'mediaDiff:progress';
    payload: {
        /** Progress percentage (0-100) */
        progress: number;
        /** Current stage description */
        stage: string;
    };
}
/**
 * Diff analysis complete
 */
export interface DiffResultResponse extends BaseMediaDiffResponse {
    type: 'mediaDiff:result';
    payload: DiffResult;
}
/**
 * Frame data response
 */
export interface FrameDataResponse extends BaseMediaDiffResponse {
    type: 'mediaDiff:frameData';
    payload: {
        time: number;
        version: 'current' | 'previous';
        /** JPEG image buffer */
        imageBuffer: ArrayBuffer;
    };
}
/**
 * Image data for visualization
 */
export interface ImageDataResponse extends BaseMediaDiffResponse {
    type: 'mediaDiff:imageData';
    payload: {
        /** Current image buffer */
        currentImage: ArrayBuffer;
        /** Previous image buffer */
        previousImage: ArrayBuffer;
        /** Heatmap overlay (optional) */
        heatmap?: ArrayBuffer;
        /** MIME type */
        mimeType: string;
    };
}
/**
 * Waveform data for audio visualization
 */
export interface WaveformDataResponse extends BaseMediaDiffResponse {
    type: 'mediaDiff:waveformData';
    payload: {
        currentWaveform: number[];
        previousWaveform: number[];
    };
}
/**
 * All response types
 */
export type MediaDiffResponse = DiffInitResponse | DiffProgressResponse | DiffResultResponse | FrameDataResponse | ImageDataResponse | WaveformDataResponse;
/** Protocol version */
export declare const MEDIA_DIFF_PROTOCOL_VERSION = "1.0.0";
/** Default analysis timeout (30 seconds) */
export declare const DEFAULT_DIFF_TIMEOUT = 30000;
/** Default keyframe sample count for video diff */
export declare const DEFAULT_KEYFRAME_SAMPLES = 10;
/** Default waveform sample count for audio diff */
export declare const DEFAULT_WAVEFORM_SAMPLES = 1000;
/**
 * Get media type from file extension
 */
export declare function getMediaType(filePath: string): MediaType | null;
/**
 * Check if file is a supported media file
 */
export declare function isSupportedMediaFile(filePath: string): boolean;
/**
 * Format similarity as percentage string
 */
export declare function formatSimilarity(similarity: number): string;
/**
 * Get similarity interpretation
 */
export declare function getSimilarityLevel(similarity: number): 'identical' | 'similar' | 'different' | 'significantly-different';
//# sourceMappingURL=mediaDiffProtocol.d.ts.map