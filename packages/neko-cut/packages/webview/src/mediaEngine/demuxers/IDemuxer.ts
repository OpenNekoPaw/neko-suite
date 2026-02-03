/**
 * IDemuxer - Unified demuxer interface
 *
 * All demuxer implementations (MP4Demuxer, LibavDemuxer, etc.)
 * must implement this interface to ensure consistent behavior.
 */

import type {
	DemuxedMediaInfo,
	EncodedAudioSample,
	AudioDescription,
} from './types';

/**
 * Unified demuxer interface
 *
 * Provides a consistent API for demuxing various container formats.
 * Implementations should support on-demand loading via Range requests.
 */
export interface IDemuxer {
	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/**
	 * Initialize the demuxer
	 * Loads metadata and builds sample index
	 * @returns Media information including video/audio track details
	 */
	initialize(): Promise<DemuxedMediaInfo>;

	/**
	 * Dispose resources and clean up
	 */
	dispose(): void;

	// ===========================================================================
	// Video Data Access
	// ===========================================================================

	/**
	 * Get video chunks starting from the nearest keyframe before the target time
	 * @param time Target time in seconds
	 * @param count Number of samples to return (default: 16)
	 * @returns Array of EncodedVideoChunk ready for decoding
	 */
	getVideoChunksAt(time: number, count?: number): Promise<EncodedVideoChunk[]>;

	/**
	 * Get a single sample at specific index
	 * @param sampleIndex Sample index (0-based)
	 * @returns EncodedVideoChunk or null if not found
	 */
	getSampleAt(sampleIndex: number): Promise<EncodedVideoChunk | null>;

	// ===========================================================================
	// Audio Data Access
	// ===========================================================================

	/**
	 * Get audio samples in a time range
	 * @param time Start time in seconds
	 * @param duration Duration in seconds
	 * @returns Array of encoded audio samples
	 */
	getAudioSamplesAt(time: number, duration: number): Promise<EncodedAudioSample[]>;

	/**
	 * Get audio codec description for decoder initialization
	 * @returns Audio description or null if no audio track
	 */
	getAudioDescription(): AudioDescription | null;

	// ===========================================================================
	// Index and Query
	// ===========================================================================

	/**
	 * Get sample index for a given time
	 * @param time Time in seconds
	 * @returns Sample index at or before the target time
	 */
	getSampleIndexAtTime(time: number): number;

	/**
	 * Get time for a sample index
	 * @param sampleIndex Sample index
	 * @returns Time in seconds
	 */
	getSampleTime(sampleIndex: number): number;

	/**
	 * Find the nearest keyframe at or before the given sample index
	 * @param sampleIndex Target sample index
	 * @returns Keyframe sample index
	 */
	findNearestKeyframe(sampleIndex: number): number;

	/**
	 * Get all keyframe times in the video
	 * @returns Array of keyframe times in seconds, sorted ascending
	 */
	getKeyframeTimes(): Promise<number[]>;

	/**
	 * Find the nearest keyframe time to the given time
	 * @param time Target time in seconds
	 * @returns Time of the nearest keyframe (at or before target)
	 */
	getNearestKeyframeTime(time: number): number;

	/**
	 * Find the nearest IDR frame time to the given time
	 * For Open GOP videos, this returns the nearest true random access point
	 * @param time Target time in seconds
	 * @returns Time of the nearest IDR frame (at or before target)
	 */
	findNearestIDRTime(time: number): Promise<number>;

	// ===========================================================================
	// Properties
	// ===========================================================================

	/** Media information (null if not initialized) */
	readonly mediaInfo: DemuxedMediaInfo | null;

	/** Whether the demuxer is initialized */
	readonly isInitialized: boolean;

	/** Total number of video samples */
	readonly sampleCount: number;

	/** Number of keyframes */
	readonly keyframeCount: number;

	/** Total number of audio samples */
	readonly audioSampleCount: number;

	// ===========================================================================
	// Callbacks
	// ===========================================================================

	/** Called when video decoder config is available */
	onVideoConfig?: (config: VideoDecoderConfig) => void;

	/** Called on error */
	onError?: (error: Error) => void;
}
