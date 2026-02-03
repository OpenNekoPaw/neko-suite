/**
 * WebCodecs Video Decoder
 *
 * Implements IVideoDecoder using WebCodecs API for hardware-accelerated
 * video decoding in the browser/Webview environment.
 *
 * Supported codecs: H.264, VP8, VP9
 */

import type {
	IVideoDecoder,
	VideoDecoderConfig,
	DecodedVideoFrame,
	PixelFormat,
	MediaInfo,
} from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

interface PendingFrame {
	resolve: (frame: DecodedVideoFrame | null) => void;
	reject: (error: Error) => void;
}

// =============================================================================
// WebCodecs Video Decoder
// =============================================================================

/**
 * WebCodecs-based video decoder for basic mode
 *
 * Uses the browser's WebCodecs API for hardware-accelerated decoding.
 * Requires a demuxer (e.g., mp4box.js) to extract encoded chunks.
 */
export class WebCodecsVideoDecoder implements IVideoDecoder {
	readonly type = 'video' as const;

	private _mediaInfo: MediaInfo | null = null;
	private _isOpen = false;
	private _position = 0;
	private _config: VideoDecoderConfig;

	private _decoder: VideoDecoder | null = null;
	private _pendingFrames: PendingFrame[] = [];
	private _decodedFrames: DecodedVideoFrame[] = [];
	private _outputFormat: PixelFormat;
	private _zeroCopy: boolean;

	constructor(config: VideoDecoderConfig) {
		this._config = config;
		this._outputFormat = config.outputFormat ?? 'rgba';
		// Enable zero-copy by default for better performance
		this._zeroCopy = config.zeroCopy ?? true;
	}

	// =========================================================================
	// Properties
	// =========================================================================

	get mediaInfo(): MediaInfo | null {
		return this._mediaInfo;
	}

	get isOpen(): boolean {
		return this._isOpen;
	}

	get position(): number {
		return this._position;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async open(): Promise<MediaInfo> {
		if (this._isOpen) {
			throw new Error('Decoder is already open');
		}

		// Initialize WebCodecs decoder
		this._decoder = new VideoDecoder({
			output: (frame) => this.handleDecodedFrame(frame),
			error: (error) => this.handleError(error),
		});

		// For now, we need media info from external source (demuxer)
		// This will be set via setMediaInfo() after demuxing
		this._isOpen = true;

		// Return placeholder - actual info comes from demuxer
		if (!this._mediaInfo) {
			throw new Error('Media info not available. Call setMediaInfo() after demuxing.');
		}

		return this._mediaInfo;
	}

	/**
	 * Set media info from external demuxer
	 */
	setMediaInfo(info: MediaInfo): void {
		this._mediaInfo = info;
	}

	/**
	 * Configure the decoder with codec parameters
	 */
	async configure(codecConfig?: VideoDecoderConfig): Promise<void> {
		if (!this._decoder) {
			throw new Error('Decoder not initialized');
		}

		const config = codecConfig ?? this._config;

		// Map codec string to WebCodecs codec string
		const codec = this.mapCodecString(config.source);

		this._decoder.configure({
			codec,
			// Additional config from demuxer (description, etc.)
		});
	}

	async close(): Promise<void> {
		if (this._decoder) {
			await this._decoder.flush();
			this._decoder.close();
			this._decoder = null;
		}

		this._isOpen = false;
		this._mediaInfo = null;
		this._decodedFrames = [];
		this._pendingFrames = [];
	}

	// =========================================================================
	// Decoding
	// =========================================================================

	async seek(time: number): Promise<void> {
		if (!this._isOpen) {
			throw new Error('Decoder is not open');
		}

		// Clear pending frames
		this._decodedFrames = [];

		// Flush decoder to clear pending work
		// Note: Don't call reset() as it puts decoder back to unconfigured state
		// and would require reconfiguration before decoding can continue
		if (this._decoder && this._decoder.state === 'configured') {
			await this._decoder.flush();
		}

		this._position = time;
	}

	async decodeNext(): Promise<DecodedVideoFrame | null> {
		if (!this._isOpen) {
			throw new Error('Decoder is not open');
		}

		// Return buffered frame if available
		if (this._decodedFrames.length > 0) {
			const frame = this._decodedFrames.shift()!;
			this._position = frame.timestamp;
			return frame;
		}

		// Wait for next frame
		return new Promise((resolve, reject) => {
			this._pendingFrames.push({ resolve, reject });
		});
	}

	async decodeAt(time: number): Promise<DecodedVideoFrame | null> {
		await this.seek(time);
		return this.decodeNext();
	}

	async *decodeRange(
		startTime: number,
		duration: number,
		fps: number
	): AsyncGenerator<DecodedVideoFrame, void, undefined> {
		const endTime = startTime + duration;
		const frameInterval = 1 / fps;

		await this.seek(startTime);

		let currentTime = startTime;
		while (currentTime < endTime) {
			const frame = await this.decodeAt(currentTime);
			if (frame) {
				yield frame;
			}
			currentTime += frameInterval;
		}
	}

	// =========================================================================
	// Chunk Input (for demuxer integration)
	// =========================================================================

	/**
	 * Feed an encoded chunk to the decoder
	 * Called by the demuxer when it extracts a video sample
	 */
	feedChunk(chunk: EncodedVideoChunk): void {
		if (!this._decoder || this._decoder.state !== 'configured') {
			throw new Error('Decoder not configured');
		}

		this._decoder.decode(chunk);
	}

	/**
	 * Signal end of stream
	 */
	async flush(): Promise<void> {
		if (this._decoder) {
			await this._decoder.flush();
		}
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private handleDecodedFrame(videoFrame: VideoFrame): void {
		// Convert VideoFrame to DecodedVideoFrame
		const frame = this.convertVideoFrame(videoFrame);

		// Resolve pending promise or buffer the frame
		if (this._pendingFrames.length > 0) {
			const pending = this._pendingFrames.shift()!;
			pending.resolve(frame);
		} else {
			this._decodedFrames.push(frame);
		}

		// Only close the VideoFrame if we copied the data (non-zero-copy mode)
		// In zero-copy mode, the caller is responsible for closing the frame
		if (!this._zeroCopy) {
			videoFrame.close();
		}
	}

	private handleError(error: DOMException): void {
		console.error('[WebCodecsVideoDecoder] Decode error:', error);

		// Reject all pending frames
		for (const pending of this._pendingFrames) {
			pending.reject(new Error(`Decode error: ${error.message}`));
		}
		this._pendingFrames = [];
	}

	private convertVideoFrame(videoFrame: VideoFrame): DecodedVideoFrame {
		const width = videoFrame.displayWidth;
		const height = videoFrame.displayHeight;

		// Zero-copy mode: return VideoFrame directly for GPU processing
		if (this._zeroCopy) {
			return {
				type: 'video',
				data: videoFrame, // Pass VideoFrame directly - caller must close it
				width,
				height,
				format: 'rgba', // VideoFrame handles format internally
				timestamp: videoFrame.timestamp / 1_000_000, // Convert microseconds to seconds
				isKeyframe: false, // WebCodecs doesn't expose this directly
			};
		}

		// Legacy mode: copy to Uint8Array (slower but compatible)
		const buffer = new Uint8Array(width * height * 4);

		// Copy frame data to buffer
		videoFrame.copyTo(buffer, {
			rect: { x: 0, y: 0, width, height },
			layout: [{ offset: 0, stride: width * 4 }],
		});

		return {
			type: 'video',
			data: buffer,
			width,
			height,
			format: this._outputFormat,
			timestamp: videoFrame.timestamp / 1_000_000, // Convert microseconds to seconds
			isKeyframe: false, // WebCodecs doesn't expose this directly
		};
	}

	private mapCodecString(codec: string): string {
		// Map common codec names to WebCodecs codec strings
		const codecMap: Record<string, string> = {
			h264: 'avc1.42E01E', // H.264 Baseline
			'h264-main': 'avc1.4D401E', // H.264 Main
			'h264-high': 'avc1.64001E', // H.264 High
			vp8: 'vp8',
			vp9: 'vp09.00.10.08',
		};

		return codecMap[codec.toLowerCase()] ?? codec;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a WebCodecs video decoder
 */
export function createWebCodecsVideoDecoder(
	config: VideoDecoderConfig
): WebCodecsVideoDecoder {
	return new WebCodecsVideoDecoder(config);
}

/**
 * Check if WebCodecs is supported
 */
export function isWebCodecsSupported(): boolean {
	return typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

/**
 * Check if a specific codec is supported for decoding
 */
export async function isCodecSupported(codec: string): Promise<boolean> {
	if (!isWebCodecsSupported()) {
		return false;
	}

	try {
		const support = await VideoDecoder.isConfigSupported({ codec });
		return support.supported ?? false;
	} catch {
		return false;
	}
}
