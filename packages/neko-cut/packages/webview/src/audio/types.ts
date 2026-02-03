/**
 * Audio Player Types
 *
 * Common interfaces for audio playback in both basic and compatibility modes.
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Audio player configuration
 */
export interface AudioPlayerConfig {
	/** Audio buffer ahead of playhead (seconds) */
	bufferAhead?: number;
	/** Audio buffer behind playhead (seconds) */
	bufferBehind?: number;
	/** Sample rate for AudioContext */
	sampleRate?: number;
	/** Output channels (default: 2) */
	channels?: number;
	/** Segment duration for decoding (seconds) */
	segmentDuration?: number;
	/** Preload threshold: preload when clip starts within this window (seconds) */
	preloadThreshold?: number;
	/** Max cache size in bytes (default 50MB) */
	maxCacheSize?: number;
	/** Scheduler tick interval (ms, default 200) */
	schedulerIntervalMs?: number;
}

/**
 * Audio source information
 */
export interface AudioSourceInfo {
	/** Unique element ID */
	id: string;
	/** Source URL or path */
	src: string;
	/** Resolved webview URI (unused in new implementation) */
	uri: string;
	/** Start time on timeline */
	startTime: number;
	/** End time on timeline */
	endTime: number;
	/** Trim start (offset into source) */
	trimStart: number;
	/** Duration on timeline */
	duration: number;
	/** Volume (0-1) */
	volume: number;
	/** Pan (-1 to 1) */
	pan: number;
	/** Muted */
	muted: boolean;
	/** Fade in duration */
	fadeIn: number;
	/** Fade out duration */
	fadeOut: number;
}

// =============================================================================
// Audio Player Interface
// =============================================================================

/**
 * Audio player interface
 *
 * Common interface for both basic mode (libav.js) and compatibility mode (Extension FFmpeg).
 */
export interface IAudioPlayer {
	/**
	 * Initialize audio context
	 */
	initialize(): Promise<void>;

	/**
	 * Add audio source
	 */
	addSource(sourceInfo: AudioSourceInfo): Promise<void>;

	/**
	 * Remove audio source
	 */
	removeSource(id: string): void;

	/**
	 * Update source properties
	 */
	updateSource(id: string, updates: Partial<AudioSourceInfo>): void;

	/**
	 * Set master volume (global volume control)
	 * @param volume Volume (0-1)
	 */
	setMasterVolume(volume: number): void;

	/**
	 * Play audio from specified timeline time
	 */
	play(time: number): Promise<void>;

	/**
	 * Pause audio
	 */
	pause(): void;

	/**
	 * Seek to specified timeline time
	 */
	seek(time: number): Promise<void>;

	/**
	 * Synchronize playback to specified timeline time
	 */
	sync(time: number): void;

	/**
	 * Dispose resources
	 */
	dispose(): void;
}

// =============================================================================
// Audio Player Mode
// =============================================================================

/**
 * Audio player mode
 * Only compatibility mode is supported (Extension FFmpeg via NAPI)
 */
export type AudioPlayerMode = 'compatibility';
