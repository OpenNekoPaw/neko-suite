/**
 * WebviewVideoDecoder - Unified video decoder for Webview (Streaming Design)
 *
 * Integrates MP4Demuxer + WebCodecs VideoDecoder to provide
 * a simple getFrameAt(time) interface.
 *
 * Architecture:
 * - Streaming mode: Maintains decoder state for sequential playback
 * - Keyframe cache (LRU) for fast seek
 * - Caller owns returned frames and must close() them
 *
 * Playback optimization:
 * - Sequential frames: Reuse decoder state, only decode new chunks
 * - Seek/Jump: Reset decoder, decode from nearest keyframe
 */

import {
	createDemuxer,
	isVideoCodecSupported,
	type IDemuxer,
	type DemuxedMediaInfo,
} from '../demuxers';

// =============================================================================
// Types
// =============================================================================

/**
 * Decoder configuration
 */
export interface WebviewVideoDecoderConfig {
	/** Video source URL (webview URI) */
	source: string;
	/**
	 * Original file path (relative to .jvi file)
	 * When provided, enables Extension Host file reading for Range requests
	 * This is required for proper on-demand loading in VSCode webview
	 * (webview URIs don't support HTTP Range requests)
	 */
	filePath?: string;
	/**
	 * Use Annex B format for video decoding (default: true)
	 * When true:
	 * - Video data is converted from AVCC (length-prefixed) to Annex B (start code prefixed)
	 * - VideoDecoderConfig.description is not provided
	 * - Decoder reads SPS/PPS from bitstream (in-band)
	 *
	 * This is useful for videos with multiple SPS/PPS sets (in-band parameter sets)
	 * where the decoder needs to handle parameter set changes dynamically.
	 *
	 * Set to false to use AVCC mode with out-of-band SPS/PPS (legacy behavior).
	 */
	useAnnexB?: boolean;
}

/**
 * Decoder state
 */
type DecoderState = 'idle' | 'initializing' | 'ready' | 'seeking' | 'decoding' | 'error' | 'disposed';

/**
 * Format support result
 */
export interface FormatSupportResult {
	supported: boolean;
	message?: string;
	suggestion?: string;
}

// =============================================================================
// Constants
// =============================================================================

const FRAME_TOLERANCE_FACTOR = 0.5; // Half frame duration tolerance
const MAX_KEYFRAME_CACHE_SIZE = 120; // Maximum number of keyframes to cache (docs/principle.md)
const SEQUENTIAL_THRESHOLD = 2.0; // Max time gap (seconds) to consider sequential playback
const FRAME_BUFFER_SIZE = 30; // Number of frames to keep in streaming buffer
const DECODE_QUEUE_THRESHOLD = 10; // Max chunks in decode queue before waiting

/**
 * Cached keyframe entry (LRU cache for fast seek)
 */
interface CachedKeyframe {
	frame: VideoFrame;
	timestamp: number;
	lastAccess: number; // For LRU eviction
}

// =============================================================================
// WebviewVideoDecoder Class
// =============================================================================

export class WebviewVideoDecoder {
	private _config: WebviewVideoDecoderConfig;
	private _demuxer: IDemuxer | null = null;
	private _decoder: VideoDecoder | null = null;
	private _state: DecoderState = 'idle';
	private _mediaInfo: DemuxedMediaInfo | null = null;

	// Keyframe cache for fast seek (LRU eviction)
	private _keyframeCache: Map<number, CachedKeyframe> = new Map();

	// Track which chunk timestamps are keyframes (set during decoding)
	private _keyframeTimestamps: Set<number> = new Set();

	// Decoding state
	private _pendingFrames: Map<number, (frame: VideoFrame | null) => void> = new Map();

	// Decoder initialization promise (resolved when onVideoConfig is called)
	private _decoderReadyResolve: (() => void) | null = null;

	// Stored decoder config for reconfiguring after reset
	private _decoderConfig: VideoDecoderConfig | null = null;

	// Flag to track if we need a keyframe before decoding
	// After configure() or reset(), VideoDecoder requires a keyframe first
	private _needsKeyframe = true;

	// ==========================================================================
	// Dual-Decoder Strategy: Preview decoder for instant keyframe preview
	// ==========================================================================
	private _previewDecoder: VideoDecoder | null = null;
	private _previewNeedsKeyframe = true;
	private _previewFrame: VideoFrame | null = null; // Latest preview frame

	// Error handling
	private _lastError: Error | null = null;

	// Decode lock to prevent concurrent decode operations
	private _decodeLock: Promise<void> = Promise.resolve();
	private _decodeLockRelease: (() => void) | null = null;

	// Decoded frames buffer for current decode operation (zero-copy)
	// Frames are collected here during decode, then the target frame is returned
	private _decodedFrames: VideoFrame[] = [];

	// ==========================================================================
	// Decode Statistics
	// ==========================================================================
	private _decodeStats = {
		totalDecodeTime: 0,
		decodeCount: 0,
	};

	// ==========================================================================
	// Streaming Playback State
	// ==========================================================================
	// Last decoded position for sequential playback detection
	private _lastDecodedTime: number = -1;
	private _lastDecodedSampleIndex: number = -1;

	// Streaming frame buffer: holds recently decoded frames for sequential access
	private _streamingBuffer: Map<number, VideoFrame> = new Map(); // key: timestamp in ms
	private _streamingBufferOrder: number[] = []; // timestamps in decode order

	// Flag to indicate if we're in streaming mode (sequential playback)
	private _isStreaming: boolean = false;

	// Flag to indicate if video has B-frames (detected during decode)
	// When true, streaming mode is disabled because PTS order != DTS order
	private _hasBFrames: boolean = false;

	constructor(config: WebviewVideoDecoderConfig) {
		this._config = config;
	}

	// ===========================================================================
	// Public Methods
	// ===========================================================================

	/**
	 * Open the decoder and initialize
	 */
	async open(): Promise<DemuxedMediaInfo> {
		if (this._state !== 'idle') {
			if (this._mediaInfo) return this._mediaInfo;
			throw new Error(`Cannot open: decoder is in ${this._state} state`);
		}

		this._state = 'initializing';

		try {
			// Create and initialize demuxer (auto-detects format)
			this._demuxer = createDemuxer({
				source: this._config.source,
				filePath: this._config.filePath, // Enable Extension Host file reading
				videoFormat: this._config.useAnnexB ? 'annexb' : 'auto',
			});

			// Set up demuxer callbacks
			this._setupDemuxerCallbacks();

			// Initialize demuxer (parses media info)
			this._mediaInfo = await this._demuxer.initialize();

			// Check codec support
			if (this._mediaInfo.video) {
				const support = await isVideoCodecSupported(this._mediaInfo.video.codec);
				if (!support.supported) {
					throw new Error(support.reason);
				}

				// Get first sample to extract video decoder config (avcC/description)
				const decoderReadyPromise = new Promise<void>((resolve) => {
					this._decoderReadyResolve = resolve;
				});

				// Pull first chunk to trigger onVideoConfig callback
				await this._demuxer.getVideoChunksAt(0, 1);

				// Wait for decoder initialization with timeout
				await Promise.race([
					decoderReadyPromise,
					new Promise<void>((_, reject) =>
						setTimeout(() => reject(new Error('Timeout waiting for video config')), 5000)
					)
				]);
			}

			this._state = 'ready';
			return this._mediaInfo;
		} catch (error) {
			this._state = 'error';
			this._lastError = error instanceof Error ? error : new Error(String(error));
			throw this._lastError;
		}
	}

	/**
	 * Close the decoder and release resources
	 */
	async close(): Promise<void> {
		if (this._state === 'disposed') return;

		// Stop demuxer
		this._demuxer?.dispose();
		this._demuxer = null;

		// Close main decoder
		if (this._decoder) {
			try {
				await this._decoder.flush();
				this._decoder.close();
			} catch {
				// Ignore errors during close
			}
			this._decoder = null;
		}

		// Close preview decoder
		if (this._previewDecoder) {
			try {
				this._previewDecoder.close();
			} catch {
				// Ignore errors during close
			}
			this._previewDecoder = null;
		}

		// Close preview frame
		if (this._previewFrame) {
			this._previewFrame.close();
			this._previewFrame = null;
		}

		// Clear keyframe cache
		this.clearKeyframeCache();

		// Clear decoded frames buffer
		this._clearDecodedFrames();

		// Clear streaming buffer
		this._clearStreamingBuffer();

		// Clear pending requests
		for (const resolve of this._pendingFrames.values()) {
			resolve(null);
		}
		this._pendingFrames.clear();

		this._mediaInfo = null;
		this._state = 'disposed';
	}

	/**
	 * Get cached frame count
	 */
	getCachedFrameCount(): number {
		return this._decodedFrames.length + this._keyframeCache.size + this._streamingBuffer.size;
	}

	/**
	 * Get a video frame at the specified time (streaming design)
	 *
	 * Optimized architecture:
	 * 1. Check streaming buffer for sequential playback (fast path)
	 * 2. Check keyframe cache for exact match
	 * 3. For sequential frames: continue decoding from current position
	 * 4. For seek/jump: reset decoder and decode from nearest keyframe
	 */
	async getFrameAt(time: number): Promise<VideoFrame | null> {
		if (this._state === 'disposed') return null;

		if (this._state === 'idle') {
			await this.open();
		}

		if (this._state === 'error') {
			throw this._lastError ?? new Error('Decoder is in error state');
		}

		if (!this._mediaInfo?.video) {
			console.warn('[WebviewVideoDecoder] No video track in mediaInfo');
			return null;
		}

		const fps = this._mediaInfo.video.fps;
		const frameDuration = 1 / fps;
		const tolerance = frameDuration * FRAME_TOLERANCE_FACTOR;

		// Step 1: Check streaming buffer (fast path for sequential playback)
		// No lock needed - just reading from buffer
		const bufferKey = Math.round(time * 1000);
		const bufferedFrame = this._streamingBuffer.get(bufferKey);
		if (bufferedFrame) {
			this._lastDecodedTime = time;
			return bufferedFrame.clone();
		}

		// Check nearby frames in buffer (within tolerance)
		for (const [key, frame] of this._streamingBuffer) {
			const frameTime = key / 1000;
			if (Math.abs(frameTime - time) <= tolerance) {
				this._lastDecodedTime = frameTime;
				return frame.clone();
			}
		}

		// Step 2: Check keyframe cache (with tolerance)
		// First try exact key match
		const keyframeCacheKey = Math.round(time * 1000);
		const exactKeyframe = this._keyframeCache.get(keyframeCacheKey);
		if (exactKeyframe && Math.abs(exactKeyframe.timestamp - time) <= tolerance) {
			exactKeyframe.lastAccess = performance.now();
			this._lastDecodedTime = time;
			return exactKeyframe.frame.clone();
		}

		// Then check nearby keys (within tolerance range)
		const toleranceMs = Math.ceil(tolerance * 1000);
		for (let offset = 1; offset <= toleranceMs; offset++) {
			// Check key - offset
			const lowerKeyframe = this._keyframeCache.get(keyframeCacheKey - offset);
			if (lowerKeyframe && Math.abs(lowerKeyframe.timestamp - time) <= tolerance) {
				lowerKeyframe.lastAccess = performance.now();
				this._lastDecodedTime = lowerKeyframe.timestamp;
				return lowerKeyframe.frame.clone();
			}
			// Check key + offset
			const upperKeyframe = this._keyframeCache.get(keyframeCacheKey + offset);
			if (upperKeyframe && Math.abs(upperKeyframe.timestamp - time) <= tolerance) {
				upperKeyframe.lastAccess = performance.now();
				this._lastDecodedTime = upperKeyframe.timestamp;
				return upperKeyframe.frame.clone();
			}
		}

		// Step 3: Determine if this is sequential playback or a seek
		const isSequential = this._isSequentialRequest(time, frameDuration);

		// Use streaming mode for sequential playback
		// Note: B-frames are now handled correctly - chunks are fed in DTS order,
		// and _lastDecodedSampleIndex tracks DTS position
		if (isSequential && this._isStreaming) {
			// Sequential playback: continue from current position (no lock needed)
			const frame = await this._decodeNextFrames(time, tolerance);
			if (frame) {
				return frame;
			}
			// If streaming decode failed, fall through to full decode
			console.warn(`[WebviewVideoDecoder] Streaming decode failed at ${time.toFixed(3)}s, falling back to full decode`);
		}

		// Step 4: Seek/Jump - need lock only for reset operation
		await this._acquireDecodeLock();
		try {
			this._clearStreamingBuffer();
			this._resetDecoder();
			this._isStreaming = false;
		} finally {
			this._releaseDecodeLock();
		}

		const frame = await this._decodeToTarget(time, tolerance);

		// Start streaming mode after successful decode
		if (frame) {
			this._isStreaming = true;
			this._lastDecodedTime = time;
		}

		return frame;
	}

	/**
	 * Check if the requested time is sequential to the last decoded time
	 */
	private _isSequentialRequest(time: number, frameDuration: number): boolean {
		if (this._lastDecodedTime < 0) return false;

		const timeDiff = time - this._lastDecodedTime;

		// Sequential if:
		// 1. Moving forward in time
		// 2. Gap is less than SEQUENTIAL_THRESHOLD seconds
		// 3. Gap is at least half a frame (not the same frame)
		return timeDiff > frameDuration * 0.5 && timeDiff < SEQUENTIAL_THRESHOLD;
	}

	/**
	 * Decode next frames for sequential playback (streaming mode)
	 * Maintains decoder state and only decodes new chunks
	 * Does NOT use flush() to preserve decoder state (except at end of video)
	 *
	 * IMPORTANT: Chunks are fed to decoder in DTS (decode) order,
	 * but frames are output in PTS (presentation) order.
	 * We track _lastDecodedSampleIndex by DTS order (sample array index).
	 *
	 * B-frame pipeline delay: Due to B-frames referencing future P-frames,
	 * the decoder may buffer frames internally. For example:
	 * - decode(I) -> output(I) immediately
	 * - decode(B) -> no output (waiting for P)
	 * - decode(P) -> output(B, P) in PTS order
	 * We handle this by decoding extra samples ahead.
	 */
	private async _decodeNextFrames(time: number, tolerance: number): Promise<VideoFrame | null> {
		if (!this._demuxer || !this._decoder) {
			return null;
		}

		// Check if decoder is closed (due to error) - fall back to full decode which will recreate it
		if ((this._decoder.state as string) === 'closed') {
			return null;
		}

		const fps = this._mediaInfo?.video?.fps ?? 30;
		const frameDuration = 1 / fps;

		try {
			// Calculate how many samples we need to decode
			// For B-frames, we need to decode extra samples to trigger output
			// Typical GOP structure: IBBPBBPBBP... means we may need 3-4 extra samples
			const baseFramesToDecode = Math.ceil((time - this._lastDecodedTime) / frameDuration);
			const samplesToDecodeAhead = baseFramesToDecode + 8; // Extra samples for B-frame pipeline

			// Start from the next sample after last decoded (DTS order)
			const startSampleIdx = this._lastDecodedSampleIndex >= 0
				? this._lastDecodedSampleIndex + 1
				: 0;

			// End sample index (decode enough samples to cover the target time)
			const endSampleIdx = Math.min(
				startSampleIdx + samplesToDecodeAhead,
				this._demuxer.sampleCount - 1
			);

			// Check if we're at the end of the video
			const isAtEnd = endSampleIdx >= this._demuxer.sampleCount - 1;

			// If we've already decoded past the end, check buffer
			if (startSampleIdx >= this._demuxer.sampleCount) {
				// Check streaming buffer for the target frame
				for (const [key, bufferedFrame] of this._streamingBuffer) {
					const frameTime = key / 1000;
					if (Math.abs(frameTime - time) <= tolerance) {
						this._lastDecodedTime = frameTime;
						return bufferedFrame.clone();
					}
				}
				return null;
			}

			// Get chunks from current position (DTS order)
			const chunks: EncodedVideoChunk[] = [];
			for (let i = startSampleIdx; i <= endSampleIdx; i++) {
				const chunk = await this._demuxer.getSampleAt(i);
				if (chunk) {
					chunks.push(chunk);
				}
			}

			if (chunks.length === 0) {
				return null;
			}

			// Decode chunks in DTS order (decoder state is preserved - NO flush!)
			let decodedCount = 0;

			for (const chunk of chunks) {
				// Skip if decoder needs keyframe and this isn't one
				if (this._needsKeyframe && chunk.type !== 'key') {
					return null; // Fall back to full decode
				}

				// Check if decoder was closed (due to error from previous decode)
				if ((this._decoder.state as string) === 'closed') {
					return null; // Fall back to full decode which will recreate it
				}

				// Note: chunk.timestamp is PTS, which may not be monotonic due to B-frames
				// This is normal - WebCodecs handles B-frame reordering internally
				// Chunks are fed in DTS order, frames are output in PTS order

				try {
					// Wait if decode queue is too full (backpressure)
					while ((this._decoder.state as string) !== 'closed' && this._decoder.decodeQueueSize > DECODE_QUEUE_THRESHOLD) {
						await new Promise(r => setTimeout(r, 1));
					}

					if ((this._decoder.state as string) === 'closed') {
						return null;
					}

					this._decoder.decode(chunk);
					decodedCount++;

					if (this._needsKeyframe && chunk.type === 'key') {
						this._needsKeyframe = false;
					}
				} catch (error) {
					return null; // Fall back to full decode
				}
			}

			// Update last decoded sample index (DTS order)
			if (decodedCount > 0) {
				this._lastDecodedSampleIndex = startSampleIdx + decodedCount - 1;
			}

			// Wait for decode queue to empty (typically 1-5ms for streaming)
			let waitCount = 0;
			const maxWait = 50; // Max 50ms wait for streaming
			while ((this._decoder.state as string) !== 'closed' && this._decoder.decodeQueueSize > 0 && waitCount < maxWait) {
				await new Promise(r => setTimeout(r, 1));
				waitCount++;
			}

			// At end of video: flush decoder to get remaining B-frames
			// This is necessary because B-frames may be buffered waiting for future P-frames
			if (isAtEnd && (this._decoder.state as string) !== 'closed') {
				try {
					await this._decoder.flush();
					// After flush, decoder needs keyframe for next decode
					this._needsKeyframe = true;
				} catch {
					// Ignore flush errors at end
				}
			}

			// Check if decoder encountered an error during decoding (async error)
			// If decoder is closed or needs keyframe (and not at end), fall back to full decode
			if ((this._decoder.state as string) === 'closed' || (this._needsKeyframe && !isAtEnd)) {
				return null;
			}

			// Check streaming buffer for the target frame (frames are in PTS order)
			for (const [key, bufferedFrame] of this._streamingBuffer) {
				const frameTime = key / 1000;
				if (Math.abs(frameTime - time) <= tolerance) {
					this._lastDecodedTime = frameTime;
					return bufferedFrame.clone();
				}
			}

			// If not in buffer, check _decodedFrames (output in PTS order)
			let bestFrame: VideoFrame | null = null;
			let bestDiff = Infinity;

			for (const frame of this._decodedFrames) {
				const frameTime = frame.timestamp / 1_000_000;
				const diff = Math.abs(frameTime - time);
				if (diff < bestDiff) {
					if (bestFrame) {
						this._addToStreamingBuffer(bestFrame);
					}
					bestDiff = diff;
					bestFrame = frame;
				} else {
					this._addToStreamingBuffer(frame);
				}
			}
			this._decodedFrames = [];

			if (bestFrame && bestDiff <= tolerance * 2) {
				this._lastDecodedTime = bestFrame.timestamp / 1_000_000;
				return bestFrame;
			} else if (bestFrame) {
				this._addToStreamingBuffer(bestFrame);
			}

			return null;
		} catch (error) {
			console.error(`[WebviewVideoDecoder] StreamingDecode error:`, error);
			return null;
		}
	}

	/**
	 * Add a frame to the streaming buffer
	 */
	private _addToStreamingBuffer(frame: VideoFrame): void {
		const key = Math.round(frame.timestamp / 1000); // Convert to ms key

		// Don't add if already exists
		if (this._streamingBuffer.has(key)) {
			frame.close();
			return;
		}

		// Evict oldest frames if buffer is full
		while (this._streamingBuffer.size >= FRAME_BUFFER_SIZE && this._streamingBufferOrder.length > 0) {
			const oldestKey = this._streamingBufferOrder.shift();
			if (oldestKey !== undefined) {
				const oldFrame = this._streamingBuffer.get(oldestKey);
				if (oldFrame) {
					try {
						oldFrame.close();
					} catch {
						// Ignore
					}
				}
				this._streamingBuffer.delete(oldestKey);
			}
		}

		// Add new frame
		this._streamingBuffer.set(key, frame);
		this._streamingBufferOrder.push(key);
	}

	/**
	 * Clear the streaming buffer
	 */
	private _clearStreamingBuffer(): void {
		for (const frame of this._streamingBuffer.values()) {
			try {
				frame.close();
			} catch {
				// Ignore
			}
		}
		this._streamingBuffer.clear();
		this._streamingBufferOrder = [];
		this._lastDecodedTime = -1;
		this._lastDecodedSampleIndex = -1;
	}

	/**
	 * Clear decoded frames buffer
	 */
	private _clearDecodedFrames(): void {
		for (const frame of this._decodedFrames) {
			try {
				frame.close();
			} catch {
				// Ignore
			}
		}
		this._decodedFrames = [];
	}

	/**
	 * Decode from nearest keyframe to target time (streaming mode - preserves decoder state)
	 * Returns the frame closest to target time, caller owns the frame
	 * Does NOT use flush() to preserve decoder state for subsequent frames
	 *
	 * IMPORTANT: Chunks are fed to decoder in DTS (decode) order,
	 * but frames are output in PTS (presentation) order.
	 * We track _lastDecodedSampleIndex by DTS order (sample array index).
	 */
	private async _decodeToTarget(time: number, tolerance: number): Promise<VideoFrame | null> {
		if (!this._demuxer || !this._decoder) {
			return null;
		}

		const decodeStart = performance.now();
		const fps = this._mediaInfo?.video?.fps ?? 30;
		const samplesToRequest = Math.ceil(fps * 2); // Request ~2 seconds worth

		try {
			// Clear previous decoded frames
			this._clearDecodedFrames();
			this._keyframeTimestamps.clear();

			// Find the keyframe sample index to start from (DTS order)
			const targetSampleIdx = this._demuxer.getSampleIndexAtTime(time);
			const keyframeSampleIdx = this._demuxer.findNearestKeyframe(targetSampleIdx);

			// Get chunks from demuxer (starts from keyframe, in DTS order)
			const chunks = await this._demuxer.getVideoChunksAt(time, samplesToRequest);

			if (chunks.length === 0) {
				return null;
			}

			// Track the actual sample index being decoded (DTS order)
			let currentSampleIdx = keyframeSampleIdx;
			let lastChunkPTS = -1; // For B-frame detection

			// Decode chunks in DTS order (NO flush - preserves decoder state)
			// Note: chunk.timestamp (PTS) may not be monotonic due to B-frames
			// This is normal - WebCodecs handles B-frame reordering internally
			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];
				if (!chunk) continue;

				const chunkPTS = chunk.timestamp / 1_000_000;

				// Detect B-frames: if PTS goes backwards, video has B-frames
				if (lastChunkPTS >= 0 && chunk.timestamp < lastChunkPTS) {
					if (!this._hasBFrames) {
						this._hasBFrames = true;
					}
				}
				lastChunkPTS = chunk.timestamp;

				// Skip non-keyframes if decoder needs keyframe
				if (this._needsKeyframe && chunk.type !== 'key') {
					currentSampleIdx++; // Still increment DTS index
					continue;
				}

				// Track keyframe timestamps (for cache)
				if (chunk.type === 'key') {
					this._keyframeTimestamps.add(chunkPTS);
				}

				try {
					// Wait if decode queue is too full (backpressure)
					while ((this._decoder.state as string) !== 'closed' && this._decoder.decodeQueueSize > DECODE_QUEUE_THRESHOLD) {
						await new Promise(r => setTimeout(r, 1));
					}

					// Check if decoder was closed during wait
					if ((this._decoder.state as string) === 'closed') {
						this._clearDecodedFrames();
						return null;
					}

					this._decoder.decode(chunk);

					if (this._needsKeyframe && chunk.type === 'key') {
						this._needsKeyframe = false;
					}

					// Stop decoding once we've passed target time by a few frames (based on PTS)
					// But continue tracking DTS index
					if (chunkPTS >= time + tolerance * 4) {
						currentSampleIdx++; // Increment for this chunk
						break;
					}
				} catch (error) {
					if (error instanceof DOMException && error.message.includes('key frame')) {
						this._needsKeyframe = true;
					}
				}

				currentSampleIdx++; // Increment DTS index after each chunk
			}

			// Record the last decoded sample index (DTS order)
			// This is the index of the last chunk we fed to the decoder
			const lastDecodedSampleIdx = currentSampleIdx - 1;

			// Wait for decode queue to empty (frames are output via callback in PTS order)
			// This is much faster than fixed timeout - typically 5-20ms
			let waitCount = 0;
			const maxWait = 100; // Max 100ms wait
			while ((this._decoder.state as string) !== 'closed' && this._decoder.decodeQueueSize > 0 && waitCount < maxWait) {
				await new Promise(r => setTimeout(r, 1));
				waitCount++;
			}

			// Check if decoder encountered an error during decoding (async error)
			if ((this._decoder.state as string) === 'closed') {
				this._clearDecodedFrames();
				return null;
			}

			// Now find the best frame from decoded frames buffer (frames are in PTS order)
			let bestFrame: VideoFrame | null = null;
			let bestDiff = Infinity;

			for (const decodedFrame of this._decodedFrames) {
				const frameTime = decodedFrame.timestamp / 1_000_000;
				const diff = Math.abs(frameTime - time);

				if (diff < bestDiff) {
					if (bestFrame) {
						// Move previous best to streaming buffer if it's after target
						const prevTime = bestFrame.timestamp / 1_000_000;
						if (prevTime > time) {
							this._addToStreamingBuffer(bestFrame);
						} else {
							bestFrame.close();
						}
					}
					bestDiff = diff;
					bestFrame = decodedFrame;
				} else if (frameTime > time) {
					// Add future frames to streaming buffer
					this._addToStreamingBuffer(decodedFrame);
				} else {
					// Close past frames
					decodedFrame.close();
				}
			}

			// Clear the buffer (frames are either returned, buffered, or closed)
			this._decodedFrames = [];

			// Update streaming state
			// CRITICAL: _lastDecodedSampleIndex tracks DTS order (sample array index)
			// This ensures streaming mode continues from the correct position
			if (bestFrame) {
				const frameTime = bestFrame.timestamp / 1_000_000;
				this._lastDecodedTime = frameTime;
				this._lastDecodedSampleIndex = lastDecodedSampleIdx;
				// Update decode stats
				this._decodeStats.totalDecodeTime += performance.now() - decodeStart;
				this._decodeStats.decodeCount++;
				return bestFrame;
			}

			// Fallback: check streaming buffer
			for (const [key, bufferedFrame] of this._streamingBuffer) {
				const frameTime = key / 1000;
				if (Math.abs(frameTime - time) <= tolerance * 2) {
					this._lastDecodedTime = frameTime;
					this._lastDecodedSampleIndex = lastDecodedSampleIdx;
					// Update decode stats
					this._decodeStats.totalDecodeTime += performance.now() - decodeStart;
					this._decodeStats.decodeCount++;
					return bufferedFrame.clone();
				}
			}

			return null;
		} catch (error) {
			console.error(`[WebviewVideoDecoder] DecodeToTarget error:`, error);
			this._clearDecodedFrames();
			return null;
		}
	}

	/**
	 * Clear the keyframe cache
	 */
	clearKeyframeCache(): void {
		for (const entry of this._keyframeCache.values()) {
			try {
				entry.frame.close();
			} catch {
				// Ignore
			}
		}
		this._keyframeCache.clear();
	}

	/**
	 * Get cached keyframe at or before the given time
	 * Returns the closest keyframe that is <= time
	 */
	getCachedKeyframe(time: number): VideoFrame | null {
		let bestEntry: CachedKeyframe | null = null;
		let bestTime = -Infinity;

		for (const [, entry] of this._keyframeCache) {
			if (entry.timestamp <= time && entry.timestamp > bestTime) {
				bestTime = entry.timestamp;
				bestEntry = entry;
			}
		}

		if (bestEntry) {
			bestEntry.lastAccess = performance.now();
			return bestEntry.frame.clone();
		}
		return null;
	}

	/**
	 * Get keyframe cache statistics
	 */
	getKeyframeCacheStats(): { count: number; timestamps: number[] } {
		const timestamps = Array.from(this._keyframeCache.values())
			.map(e => e.timestamp)
			.sort((a, b) => a - b);
		return { count: this._keyframeCache.size, timestamps };
	}

	/**
	 * Get all keyframe times in the video (IDR frames for reliable random access)
	 * Useful for thumbnail generation - thumbnails should be at keyframe positions
	 * @returns Array of keyframe times in seconds, sorted ascending
	 */
	async getKeyframeTimes(): Promise<number[]> {
		return await this._demuxer?.getKeyframeTimes() ?? [];
	}

	/**
	 * Preload keyframes for fast seek during editing
	 * Preloads only the first N keyframes, subsequent keyframes are ignored
	 * @param maxCount Maximum number of keyframes to preload (default: 100)
	 * @param signal Optional AbortSignal for cancellation
	 * @param externalKeyframeTimes Optional external keyframe times (for fragmented MP4)
	 * @returns Number of keyframes successfully preloaded
	 */
	async preloadKeyframes(maxCount = MAX_KEYFRAME_CACHE_SIZE, signal?: AbortSignal, externalKeyframeTimes?: number[]): Promise<number> {
		if (this._state === 'disposed') return 0;

		if (this._state === 'idle') {
			await this.open();
		}

		if (this._state === 'error' || !this._demuxer || !this._previewDecoder || !this._decoderConfig) {
			return 0;
		}

		// Use external keyframe times if provided (for fragmented MP4)
		// Otherwise use demuxer's keyframe times
		const keyframeTimes = externalKeyframeTimes ?? await this.getKeyframeTimes();
		if (keyframeTimes.length === 0) {
			return 0;
		}

		// Take only the first N keyframes, ignore the rest
		const timesToPreload = keyframeTimes.slice(0, maxCount);

		let preloadedCount = 0;

		for (const time of timesToPreload) {
			// Check for cancellation
			if (signal?.aborted) {
				break;
			}

			// Check if already cached
			const key = Math.round(time * 1000);
			if (this._keyframeCache.has(key)) {
				preloadedCount++;
				continue;
			}

			try {
				// Use getKeyframePreview to decode and cache the keyframe
				const frame = await this.getKeyframePreview(time);
				if (frame) {
					preloadedCount++;
					// Close the returned frame (we only need it in cache)
					frame.close();
				}
			} catch (error) {
				console.warn(`[WebviewVideoDecoder] Failed to preload keyframe at ${time.toFixed(3)}s:`, error);
			}
		}

		return preloadedCount;
	}

	/**
	 * Find the nearest keyframe time to the given time
	 * @param time Target time in seconds
	 * @returns Time of the nearest keyframe (at or before target)
	 */
	getNearestKeyframeTime(time: number): number {
		return this._demuxer?.getNearestKeyframeTime(time) ?? 0;
	}

	/**
	 * Set fragment info for fragmented MP4 on-demand loading
	 * This enables the demuxer to load fragments as needed when seeking
	 * @param fragments Array of fragment info (time and moof offset)
	 */
	setFragmentInfo(fragments: Array<{ time: number; moofOffset: number }>): void {
		if (this._demuxer && 'setFragmentInfo' in this._demuxer) {
			(this._demuxer as { setFragmentInfo: (f: Array<{ time: number; moofOffset: number }>) => void }).setFragmentInfo(fragments);
		}
	}

	/**
	 * Get decoder state
	 */
	get state(): DecoderState {
		return this._state;
	}

	/**
	 * Get decode statistics
	 */
	getDecodeStats(): { avgDecodeTime: number; decodeCount: number } {
		return {
			avgDecodeTime: this._decodeStats.decodeCount > 0
				? this._decodeStats.totalDecodeTime / this._decodeStats.decodeCount
				: 0,
			decodeCount: this._decodeStats.decodeCount,
		};
	}

	/**
	 * Reset decode statistics
	 */
	resetDecodeStats(): void {
		this._decodeStats.totalDecodeTime = 0;
		this._decodeStats.decodeCount = 0;
	}

	/**
	 * Get media info
	 */
	get mediaInfo(): DemuxedMediaInfo | null {
		return this._mediaInfo;
	}

	/**
	 * Get last error
	 */
	get lastError(): Error | null {
		return this._lastError;
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Set up demuxer callbacks
	 */
	private _setupDemuxerCallbacks(): void {
		if (!this._demuxer) return;

		this._demuxer.onVideoConfig = (config: VideoDecoderConfig) => {
			this._initializeDecoder(config);

			// Resolve the decoder ready promise if waiting
			if (this._decoderReadyResolve) {
				this._decoderReadyResolve();
				this._decoderReadyResolve = null;
			}
		};

		// Note: In on-demand pull model, we don't use onVideoSample callback
		// Samples are fetched via getVideoChunksAt() and decoded directly

		this._demuxer.onError = (error: Error) => {
			console.error('[WebviewVideoDecoder] Demuxer error:', error);
			this._lastError = error;
			this._state = 'error';
		};
	}

	/**
	 * Initialize WebCodecs VideoDecoder
	 */
	private _initializeDecoder(config: VideoDecoderConfig): void {
		if (this._decoder) {
			try {
				this._decoder.close();
			} catch {
				// Ignore - decoder may already be closed
			}
		}

		// Store config for reconfiguring after seek/reset
		this._decoderConfig = config;

		this._decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				this._handleDecodedFrame(frame);
			},
			error: (error: DOMException) => {
				this._lastError = new Error(error.message);
				// WebCodecs automatically closes the decoder on error
				// Set needsKeyframe to force restart from keyframe on next decode
				this._needsKeyframe = true;
				// Clear streaming state to force full decode
				this._isStreaming = false;
			},
		});

		this._decoder.configure(config);
		this._needsKeyframe = true;  // Require keyframe after configure

		// Initialize preview decoder for instant keyframe preview during seek
		this._initializePreviewDecoder(config);
	}

	/**
	 * Initialize preview decoder for instant keyframe preview
	 * This decoder only decodes keyframes for fast seek preview
	 */
	private _initializePreviewDecoder(config: VideoDecoderConfig): void {
		if (this._previewDecoder) {
			try {
				this._previewDecoder.close();
			} catch {
				// Ignore - decoder may already be closed
			}
		}

		this._previewDecoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				this._handlePreviewFrame(frame);
			},
			error: (error: DOMException) => {
				console.warn('[WebviewVideoDecoder] Preview decoder error:', error);
				// Note: WebCodecs automatically closes the decoder on error
			},
		});

		this._previewDecoder.configure(config);
		this._previewNeedsKeyframe = true;
	}

	/**
	 * Handle preview decoder output
	 */
	private _handlePreviewFrame(frame: VideoFrame): void {
		// Close previous preview frame
		if (this._previewFrame) {
			this._previewFrame.close();
		}

		// Store new preview frame
		this._previewFrame = frame;
	}

	/**
	 * Get instant keyframe preview for a given time
	 * Returns immediately with the nearest keyframe (may be before target time)
	 * Used during scrubbing and thumbnail generation
	 *
	 * Note: This method does NOT use the keyframe cache to avoid:
	 * 1. Thumbnail frames polluting the playback cache
	 * 2. Cache returning wrong frames for different time requests
	 */
	async getKeyframePreview(time: number): Promise<VideoFrame | null> {
		// If no demuxer or decoder config, cannot proceed
		if (!this._demuxer || !this._decoderConfig) {
			return null;
		}

		// Ask demuxer for the nearest keyframe time
		const keyframeTime = this._demuxer.getNearestKeyframeTime(time);

		// Check if preview decoder needs to be recreated (closed due to error)
		if (!this._previewDecoder || this._previewDecoder.state === 'closed') {
			this._initializePreviewDecoder(this._decoderConfig);
		}

		try {
			// Get chunks starting from keyframe
			let chunks = await this._demuxer.getVideoChunksAt(keyframeTime, 5);

			if (chunks.length === 0) {
				return null;
			}

			// Find the first keyframe chunk
			let keyframeChunk = chunks.find(c => c.type === 'key');

			// For Open GOP videos, the first chunk may be marked as 'delta' even though
			// it's a sync frame (non-IDR I-frame). In this case, we need to find the
			// nearest true IDR frame and decode from there.
			if (!keyframeChunk) {
				// Try to find nearest IDR frame time
				const idrTime = await this._demuxer.findNearestIDRTime(time);

				// If IDR time is different from keyframe time, get chunks from IDR
				if (Math.abs(idrTime - keyframeTime) > 0.001) {
					chunks = await this._demuxer.getVideoChunksAt(idrTime, 5);
					keyframeChunk = chunks.find(c => c.type === 'key');
				}

				// If still no keyframe found, try to decode the first chunk anyway
				if (!keyframeChunk) {
					const firstChunk = chunks[0];
					if (!firstChunk) {
						return null;
					}

					// Reset preview decoder and try to decode
					if (this._previewDecoder) {
						try {
							this._previewDecoder.reset();
							this._previewDecoder.configure(this._decoderConfig);
						} catch {
							this._initializePreviewDecoder(this._decoderConfig);
						}
					}

					if (!this._previewDecoder) {
						return null;
					}

					try {
						this._previewDecoder.decode(firstChunk);
						await this._previewDecoder.flush();

						if (this._previewFrame) {
							return this._previewFrame.clone();
						}
					} catch {
						// Failed to decode first chunk
					}
					return null;
				}
			}

			// Reset preview decoder if needed
			if (this._previewNeedsKeyframe && this._previewDecoder) {
				try {
					this._previewDecoder.reset();
					this._previewDecoder.configure(this._decoderConfig);
				} catch {
					this._initializePreviewDecoder(this._decoderConfig);
				}
			}

			if (!this._previewDecoder) {
				return null;
			}

			// Decode the keyframe
			this._previewDecoder.decode(keyframeChunk);
			await this._previewDecoder.flush();
			this._previewNeedsKeyframe = false;

			// Return the preview frame (no caching for thumbnail use)
			if (this._previewFrame) {
				return this._previewFrame.clone();
			}

			return null;
		} catch (error) {
			this._previewNeedsKeyframe = true;
			return null;
		}
	}

	/**
	 * Handle decoded video frame (streaming design)
	 * Frames are added to streaming buffer or decoded frames buffer
	 */
	private _handleDecodedFrame(frame: VideoFrame): void {
		const timestamp = frame.timestamp / 1_000_000; // Convert to seconds

		// Check if this frame is a keyframe and cache it
		const isKeyframe = this._keyframeTimestamps.has(timestamp);
		if (isKeyframe) {
			this._cacheKeyframe(frame, timestamp);
		}

		// Add to decoded frames buffer (will be processed by caller)
		this._decodedFrames.push(frame);
	}

	/**
	 * Cache a keyframe for fast seek
	 * Uses LRU eviction when cache is full
	 */
	private _cacheKeyframe(frame: VideoFrame, timestamp: number): void {
		// Check if already cached (use timestamp as key, quantized to 1ms)
		const key = Math.round(timestamp * 1000);
		if (this._keyframeCache.has(key)) {
			// Update last access time
			const entry = this._keyframeCache.get(key);
			if (entry) {
				entry.lastAccess = performance.now();
			}
			return;
		}

		// Evict oldest entry if cache is full (LRU)
		if (this._keyframeCache.size >= MAX_KEYFRAME_CACHE_SIZE) {
			let oldestKey: number | null = null;
			let oldestAccess = Infinity;

			for (const [k, entry] of this._keyframeCache) {
				if (entry.lastAccess < oldestAccess) {
					oldestAccess = entry.lastAccess;
					oldestKey = k;
				}
			}

			if (oldestKey !== null) {
				const evicted = this._keyframeCache.get(oldestKey);
				if (evicted) {
					try {
						evicted.frame.close();
					} catch {
						// Ignore
					}
				}
				this._keyframeCache.delete(oldestKey);
			}
		}

		// Cache the keyframe (clone to keep it alive)
		this._keyframeCache.set(key, {
			frame: frame.clone(),
			timestamp,
			lastAccess: performance.now(),
		});
	}

	/**
	 * Acquire decode lock to prevent concurrent decode operations
	 */
	private async _acquireDecodeLock(): Promise<void> {
		// Wait for any existing lock to be released
		await this._decodeLock;
		// Create new lock
		this._decodeLock = new Promise<void>((resolve) => {
			this._decodeLockRelease = resolve;
		});
	}

	/**
	 * Release decode lock
	 */
	private _releaseDecodeLock(): void {
		if (this._decodeLockRelease) {
			this._decodeLockRelease();
			this._decodeLockRelease = null;
		}
	}

	/**
	 * Reset decoder state for seeking
	 * If decoder is closed (due to error), recreate it
	 */
	private _resetDecoder(): void {
		if (!this._decoderConfig) return;

		// Check if decoder needs to be recreated (closed due to error)
		if (!this._decoder || (this._decoder.state as string) === 'closed') {
			// Recreate decoder
			this._decoder = new VideoDecoder({
				output: (frame: VideoFrame) => {
					this._handleDecodedFrame(frame);
				},
				error: (error: DOMException) => {
					console.error('[WebviewVideoDecoder] Decoder error:', error);
					this._lastError = new Error(error.message);
				},
			});
			this._decoder.configure(this._decoderConfig);
			this._needsKeyframe = true;
			return;
		}

		try {
			this._decoder.reset();
			this._decoder.configure(this._decoderConfig);
			this._needsKeyframe = true;
		} catch (error) {
			console.error('[WebviewVideoDecoder] Reset error:', error);
			// If reset fails, try to recreate the decoder
			try {
				this._decoder = new VideoDecoder({
					output: (frame: VideoFrame) => {
						this._handleDecodedFrame(frame);
					},
					error: (err: DOMException) => {
						console.error('[WebviewVideoDecoder] Decoder error:', err);
						this._lastError = new Error(err.message);
					},
				});
				this._decoder.configure(this._decoderConfig);
				this._needsKeyframe = true;
			} catch (recreateError) {
				console.error('[WebviewVideoDecoder] Failed to recreate decoder:', recreateError);
			}
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a WebviewVideoDecoder instance
 */
export function createWebviewVideoDecoder(
	config: WebviewVideoDecoderConfig
): WebviewVideoDecoder {
	return new WebviewVideoDecoder(config);
}

// =============================================================================
// Format Support Check
// =============================================================================

/**
 * Check if WebCodecs is available
 */
export function isWebCodecsAvailable(): boolean {
	return typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Check format support for basic mode
 */
export async function checkBasicModeSupport(
	codec: string
): Promise<FormatSupportResult> {
	// Check WebCodecs availability
	if (!isWebCodecsAvailable()) {
		return {
			supported: false,
			message: 'WebCodecs is not available in this environment.',
			suggestion: 'Please switch to compatible mode.',
		};
	}

	// Check codec support
	const support = await isVideoCodecSupported(codec);

	if (!support.supported) {
		return {
			supported: false,
			message: support.reason ?? `Codec "${codec}" is not supported.`,
			suggestion: 'Please switch to compatible mode for full format support.',
		};
	}

	return { supported: true };
}
