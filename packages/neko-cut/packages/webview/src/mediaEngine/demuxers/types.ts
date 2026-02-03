/**
 * Demuxer Types - Unified type definitions for all demuxers
 *
 * This file contains shared types used by MP4Demuxer, LibavDemuxer,
 * and other demuxer implementations.
 */

// =============================================================================
// Media Info Types
// =============================================================================

/**
 * Demuxed media information
 * Contains metadata about the video and audio tracks
 */
export interface DemuxedMediaInfo {
	duration: number;
	timescale: number;
	video?: {
		trackId: number;
		codec: string;
		codedWidth: number;
		codedHeight: number;
		displayWidth: number;
		displayHeight: number;
		fps: number;
		bitrate: number;
		description?: Uint8Array;
		/** Total number of samples */
		sampleCount: number;
		/** Track timescale (time units per second) */
		timescale?: number;
	};
	audio?: {
		trackId: number;
		codec: string;
		sampleRate: number;
		channelCount: number;
		bitrate: number;
		/** Track timescale (time units per second) */
		timescale?: number;
	};
}

// =============================================================================
// Sample Types
// =============================================================================

/**
 * Encoded audio sample ready for decoding
 */
export interface EncodedAudioSample {
	data: Uint8Array;
	timestamp: number;
	duration: number;
	isKeyframe: boolean;
}

/**
 * Audio codec description (e.g., esds for AAC, OpusHead for Opus)
 */
export interface AudioDescription {
	codec: string;
	sampleRate: number;
	channelCount: number;
	description?: Uint8Array;
}

/**
 * Sample info from demuxer index
 * Used internally by demuxers to track sample positions
 */
export interface SampleInfo {
	number: number;
	offset: number;
	size: number;
	cts: number;
	dts: number;
	duration: number;
	timescale: number;
	is_sync: boolean;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Base demuxer configuration
 */
export interface DemuxerConfig {
	/** Video source URL */
	source: string;
	/**
	 * File path relative to .jvi file (for Extension Host file reading)
	 * If provided, uses Extension Host for on-demand loading instead of fetch
	 */
	filePath?: string;
	/** Video track index (default: 0) */
	videoTrackIndex?: number;
	/** Audio track index (default: 0) */
	audioTrackIndex?: number;
	/**
	 * Video output format mode (default: 'auto')
	 *
	 * - 'auto': Automatically detect the best mode based on video characteristics
	 * - 'avcc': AVCC format (length-prefixed NAL units)
	 * - 'annexb': Annex B format (start code prefixed NAL units)
	 */
	videoFormat?: 'auto' | 'avcc' | 'annexb';
}

/**
 * MP4 demuxer specific configuration
 */
export interface MP4DemuxerConfig extends DemuxerConfig {
	/** Initial bytes to load for moov (default: 2MB) */
	initialLoadSize?: number;
}

/**
 * Libav demuxer specific configuration
 */
export interface LibavDemuxerConfig extends DemuxerConfig {
	/** Chunk size for range requests (default: 256KB) */
	chunkSize?: number;
}
