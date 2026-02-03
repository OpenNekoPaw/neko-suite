/**
 * CompatibleMediaFrameProvider - Extension-based frame provider for compatible mode
 *
 * Implements IMediaFrameProvider using Extension Host for video decoding.
 * Used when WebCodecs is not available or when media formats are not supported.
 *
 * Supports two modes:
 * 1. H264 Stream Mode: WebSocket-based H.264 streaming for real-time preview (recommended)
 * 2. Request-Response Mode: Traditional request/response for single frames (export, thumbnails)
 *
 * Data flow:
 * - H264 Stream Mode: Extension → H.264 encode → WebSocket /ws/h264 → WebCodecs decode → VideoFrame
 * - Request Mode: Webview → MediaRequestProxy → Extension (FFmpeg/wgpu) → IPC → Webview
 */

import type { IMediaFrameProvider, CompositeTrackConfig, UrlResolver } from './types';
import type { IMediaRequestProxy, MediaRequestOptions } from '../../../services/MediaRequestProxy';
import type { CompositeLayerConfig } from '@neko/shared';
import { H264StreamClient } from '../../../services/H264StreamClient';

// =============================================================================
// Types
// =============================================================================

/**
 * Transport mode for frame delivery
 * Currently only h264Stream is supported for real-time preview
 */
export type FrameTransportMode = 'h264Stream';

/**
 * Provider configuration
 */
export interface CompatibleMediaFrameProviderConfig {
	/** URL resolver for converting paths (not needed for Extension mode) */
	urlResolver?: UrlResolver;
	/** Maximum image cache entries (default: 50) */
	imageCacheSize?: number;
	/** Frame server port (if available) */
	frameServerPort?: number;
	/** Preferred transport mode */
	preferredTransport?: FrameTransportMode;
	/** Video width for H264 decoder config */
	videoWidth?: number;
	/** Video height for H264 decoder config */
	videoHeight?: number;
}

/**
 * Image cache entry
 */
interface ImageCacheEntry {
	bitmap: ImageBitmap;
	url: string;
	lastAccess: number;
}

/**
 * Video frame cache entry
 */
interface FrameCacheEntry {
	frame: VideoFrame;
	mediaUrl: string;
	time: number;
	lastAccess: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_IMAGE_CACHE_SIZE = 50;
const DEFAULT_FRAME_CACHE_SIZE = 30;
const FRAME_TIME_TOLERANCE = 0.016; // ~1 frame at 60fps

// =============================================================================
// CompatibleMediaFrameProvider Class
// =============================================================================

export class CompatibleMediaFrameProvider implements IMediaFrameProvider {
	private _mediaProxy: IMediaRequestProxy;
	private _disposed = false;

	// Image cache (LRU)
	private _imageCache: Map<string, ImageCacheEntry> = new Map();
	private _imageCacheSize: number;

	// Frame cache (LRU) - caches VideoFrames converted from ImageBitmaps
	private _frameCache: Map<string, FrameCacheEntry> = new Map();
	private _frameCacheSize: number = DEFAULT_FRAME_CACHE_SIZE;

	// Pending requests to avoid duplicate concurrent requests
	private _pendingFrameRequests: Map<string, Promise<VideoFrame | null>> = new Map();

	// Frame server port for H264 stream
	private _frameServerPort: number | null = null;
	private _transportMode: FrameTransportMode = 'h264Stream';

	// H264 stream mode: WebSocket-based H.264 streaming
	private _h264Client: H264StreamClient | null = null;
	private _h264LatestFrame: VideoFrame | null = null;
	private _videoWidth: number = 1920;
	private _videoHeight: number = 1080;

	constructor(
		mediaProxy: IMediaRequestProxy,
		config: CompatibleMediaFrameProviderConfig = {}
	) {
		this._mediaProxy = mediaProxy;
		this._imageCacheSize = config.imageCacheSize ?? DEFAULT_IMAGE_CACHE_SIZE;
		this._frameServerPort = config.frameServerPort ?? null;
		this._videoWidth = config.videoWidth ?? 1920;
		this._videoHeight = config.videoHeight ?? 1080;

		// Auto-enable H264 stream mode if port is provided
		if (this._frameServerPort) {
			this._initH264Client();
			console.log(`[CompatibleMediaFrameProvider] H264 stream mode enabled on port ${this._frameServerPort}`);
		}
	}

	// ===========================================================================
	// Transport Mode Control
	// ===========================================================================

	/**
	 * Get current transport mode
	 */
	get transportMode(): FrameTransportMode {
		return this._transportMode;
	}

	/**
	 * Set frame server port and optionally switch to H264 stream mode
	 */
	setFrameServerPort(port: number, autoSwitch = true): void {
		this._frameServerPort = port;
		if (autoSwitch) {
			// Default to H264 stream mode for better performance
			this.setTransportMode('h264Stream');
		}
		console.log(`[CompatibleMediaFrameProvider] Frame server port set to ${port}`);
	}

	/**
	 * Set video dimensions for H264 decoder
	 */
	setVideoDimensions(width: number, height: number): void {
		this._videoWidth = width;
		this._videoHeight = height;
		// Reinitialize H264 client if active
		if (this._transportMode === 'h264Stream' && this._h264Client) {
			this._cleanupH264Client();
			this._initH264Client();
		}
	}

	/**
	 * Set transport mode (only h264Stream is supported)
	 */
	setTransportMode(mode: FrameTransportMode): void {
		if (!this._frameServerPort) {
			console.warn(`[CompatibleMediaFrameProvider] Cannot switch to ${mode} mode: no port configured`);
			return;
		}

		const previousMode = this._transportMode;
		this._transportMode = mode;

		// Reinitialize H264 client if needed
		if (previousMode !== mode) {
			this._cleanupH264Client();
			this._initH264Client();
		}

		console.log(`[CompatibleMediaFrameProvider] Transport mode: ${mode}`);
	}

	// ===========================================================================
	// H264 Stream Mode
	// ===========================================================================

	/**
	 * Initialize H264 stream client
	 */
	private _initH264Client(): void {
		if (!this._frameServerPort) {
			console.warn('[CompatibleMediaFrameProvider] Cannot init H264 client: no port configured');
			return;
		}

		if (this._h264Client) {
			this._cleanupH264Client();
		}

		const wsUrl = `ws://127.0.0.1:${this._frameServerPort}/ws/h264`;
		console.log(`[CompatibleMediaFrameProvider] Initializing H264 client: ${wsUrl}, ${this._videoWidth}x${this._videoHeight}`);

		this._h264Client = new H264StreamClient({
			websocketUrl: wsUrl,
			width: this._videoWidth,
			height: this._videoHeight,
			preferHardware: true,
			onFrame: (frame) => this._handleH264Frame(frame),
			onConnectionChange: (connected) => {
				console.log(`[CompatibleMediaFrameProvider] H264 stream ${connected ? 'connected' : 'disconnected'}`);
			},
			onError: (error) => {
				console.error('[CompatibleMediaFrameProvider] H264 stream error:', error);
			},
		});

		// Connect to the stream
		this._h264Client.connect().catch((error) => {
			console.error('[CompatibleMediaFrameProvider] Failed to connect H264 client:', error);
		});
	}

	/**
	 * Handle decoded H264 frame
	 */
	private _handleH264Frame(frame: VideoFrame): void {
		// Close previous frame
		if (this._h264LatestFrame) {
			this._h264LatestFrame.close();
		}
		// Store the new frame (clone it since the original will be closed by the client)
		this._h264LatestFrame = frame.clone();
		// Close the original frame passed by the client
		frame.close();
	}

	/**
	 * Cleanup H264 client
	 */
	private _cleanupH264Client(): void {
		if (this._h264Client) {
			this._h264Client.disconnect();
			this._h264Client = null;
		}
		if (this._h264LatestFrame) {
			this._h264LatestFrame.close();
			this._h264LatestFrame = null;
		}
	}

	/**
	 * Get latest H264 frame (for playback)
	 */
	private _getH264Frame(): VideoFrame | null {
		if (!this._h264LatestFrame) {
			return null;
		}
		// Return a clone so the caller can manage its lifecycle
		return this._h264LatestFrame.clone();
	}

	// ===========================================================================
	// IMediaFrameProvider Implementation
	// ===========================================================================

	/**
	 * Get a video frame at the specified time
	 *
	 * Uses H264 stream mode for real-time preview via WebSocket-based H.264 streaming.
	 * Falls back to request-response mode when H264 stream is not available.
	 */
	async getVideoFrame(
		_elementId: string,
		mediaUrl: string,
		time: number,
		_nonBlocking = false
	): Promise<VideoFrame | null> {
		if (this._disposed) return null;

		// H264 stream mode: use WebSocket-based H.264 streaming for real-time preview
		if (this._transportMode === 'h264Stream' && this._h264Client) {
			// Try to get H264 frame, with short wait for seek frames
			const frame = await this._waitForH264Frame(50); // Wait up to 50ms
			if (frame) {
				return frame;
			}
			// If no H264 frame available, fall through to request mode
			console.log('[CompatibleMediaFrameProvider] No H264 frame available, using request mode');
		}

		// Fallback to request-response mode
		return this._getVideoFrameRequestMode(mediaUrl, time);
	}

	/**
	 * Wait for H264 frame with timeout
	 */
	private async _waitForH264Frame(timeoutMs: number): Promise<VideoFrame | null> {
		const startTime = performance.now();

		while (performance.now() - startTime < timeoutMs) {
			const frame = this._getH264Frame();
			if (frame) {
				return frame;
			}
			// Wait a bit before checking again
			await new Promise(resolve => setTimeout(resolve, 5));
		}

		return null;
	}

	/**
	 * Get composite video frame (multi-track)
	 * Delegates to Extension Host for server-side compositing
	 */
	async getCompositeVideoFrame(
		_elementId: string,
		tracks: CompositeTrackConfig[],
		time: number,
		width: number,
		height: number,
		_nonBlocking = false
	): Promise<VideoFrame | null> {
		if (this._disposed) return null;

		try {
			// Convert CompositeTrackConfig to CompositeLayerConfig
			const layers = this._convertTracksToLayers(tracks, time);

			// Request composited frame from Extension
			const bitmap = await this._mediaProxy.renderCompositeFrame(
				layers,
				time,
				width,
				height,
				[0, 0, 0, 255] // Black background
			);

			// Convert ImageBitmap to VideoFrame
			const frame = new VideoFrame(bitmap, {
				timestamp: Math.round(time * 1_000_000), // microseconds
			});

			// Close the bitmap after conversion
			bitmap.close();

			return frame;
		} catch (error) {
			console.error('[CompatibleMediaFrameProvider] Error getting composite frame:', error);
			return null;
		}
	}

	/**
	 * Get an image as ImageBitmap
	 */
	async getImageBitmap(
		_elementId: string,
		imageUrl: string
	): Promise<ImageBitmap | null> {
		if (this._disposed) return null;

		try {
			// Check cache
			const cached = this._imageCache.get(imageUrl);
			if (cached) {
				cached.lastAccess = Date.now();
				return cached.bitmap;
			}

			// Fetch image via Extension proxy
			// For images, we use the video frame API with time=0
			const bitmap = await this._mediaProxy.compatibleGetVideoFrame(
				imageUrl,
				0, // time
				undefined, // width
				undefined  // height
			);

			// Add to cache
			this._addToImageCache(imageUrl, bitmap);

			return bitmap;
		} catch (error) {
			console.error('[CompatibleMediaFrameProvider] Error getting image:', error);
			return null;
		}
	}

	/**
	 * Preload a media file
	 * In compatible mode, preloading is handled by Extension caching
	 */
	async preload(_mediaUrl: string): Promise<void> {
		// Extension handles caching internally
		// No explicit preload needed
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		// Dispose H264 client
		this._cleanupH264Client();

		// Close all cached frames
		for (const entry of this._frameCache.values()) {
			entry.frame.close();
		}
		this._frameCache.clear();

		// Close all cached images
		for (const entry of this._imageCache.values()) {
			entry.bitmap.close();
		}
		this._imageCache.clear();

		// Clear pending requests
		this._pendingFrameRequests.clear();

		console.log('[CompatibleMediaFrameProvider] Disposed');
	}

	/**
	 * Get cached frame count
	 */
	getCachedFrameCount(): number {
		return this._frameCache.size;
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Get video frame using request-response mode (original logic)
	 */
	private async _getVideoFrameRequestMode(
		mediaUrl: string,
		time: number
	): Promise<VideoFrame | null> {
		// Check frame cache first
		const cacheKey = this._getFrameCacheKey(mediaUrl, time);
		const cached = this._frameCache.get(cacheKey);
		if (cached && Math.abs(cached.time - time) < FRAME_TIME_TOLERANCE) {
			cached.lastAccess = Date.now();
			// Clone the cached frame to avoid issues with multiple consumers
			return cached.frame.clone();
		}

		// Check for pending request to avoid duplicate requests
		const pendingKey = `${mediaUrl}:${time.toFixed(3)}`;
		const pending = this._pendingFrameRequests.get(pendingKey);
		if (pending) {
			const frame = await pending;
			// Note: pending frame is owned by the original requester, just clone it
			return frame?.clone() ?? null;
		}

		// Create new request
		const requestPromise = this._fetchVideoFrame(mediaUrl, time);
		this._pendingFrameRequests.set(pendingKey, requestPromise);

		try {
			const frame = await requestPromise;
			if (!frame) return null;
			// Clone for caller, then close the original frame
			// (cache already has its own clone from _addToFrameCache)
			const cloned = frame.clone();
			frame.close();
			return cloned;
		} finally {
			this._pendingFrameRequests.delete(pendingKey);
		}
	}

	/**
	 * Fetch video frame from Extension Host (request-response mode)
	 */
	private async _fetchVideoFrame(
		mediaUrl: string,
		time: number
	): Promise<VideoFrame | null> {
		try {
			console.log(`[CompatibleMediaFrameProvider] _fetchVideoFrame: ${mediaUrl} @ ${time.toFixed(3)}s`);

			const options: MediaRequestOptions = {
				priority: 10, // High priority for playback frames
				timeoutMs: 30000, // 30s timeout for slow FFmpeg decode
			};

			// Request frame from Extension
			const bitmap = await this._mediaProxy.compatibleGetVideoFrame(
				mediaUrl,
				time,
				undefined, // Use original width
				undefined, // Use original height
				options
			);

			console.log(`[CompatibleMediaFrameProvider] Got bitmap from Extension: ${bitmap.width}x${bitmap.height}`);

			// Convert ImageBitmap to VideoFrame
			// Note: We need to specify format for proper color handling
			const frame = new VideoFrame(bitmap, {
				timestamp: Math.round(time * 1_000_000), // microseconds
				alpha: 'keep', // Preserve alpha channel
			});

			// Close bitmap after conversion - VideoFrame copies the data
			bitmap.close();

			console.log(`[CompatibleMediaFrameProvider] Created VideoFrame: ${frame.displayWidth}x${frame.displayHeight}, format=${frame.format}`);

			// Add to frame cache
			this._addToFrameCache(mediaUrl, time, frame);

			return frame;
		} catch (error) {
			console.error('[CompatibleMediaFrameProvider] Error fetching video frame:', error);
			return null;
		}
	}

	/**
	 * Convert CompositeTrackConfig to CompositeLayerConfig
	 */
	private _convertTracksToLayers(
		tracks: CompositeTrackConfig[],
		time: number
	): CompositeLayerConfig[] {
		return tracks.map((track, index) => ({
			source: track.videoPath,
			sourceTime: time, // Use the current playback time
			transform: {
				x: track.x,
				y: track.y,
				scaleX: 1,
				scaleY: 1,
				rotation: 0,
				anchorX: 0.5,
				anchorY: 0.5,
			},
			opacity: track.opacity ?? 1,
			zIndex: index,
		}));
	}

	/**
	 * Generate cache key for frame
	 */
	private _getFrameCacheKey(mediaUrl: string, time: number): string {
		// Quantize time to avoid floating point issues
		const quantizedTime = Math.round(time * 1000) / 1000;
		return `${mediaUrl}:${quantizedTime.toFixed(3)}`;
	}

	/**
	 * Add frame to cache with LRU eviction
	 */
	private _addToFrameCache(mediaUrl: string, time: number, frame: VideoFrame): void {
		const cacheKey = this._getFrameCacheKey(mediaUrl, time);

		// Evict oldest if cache is full
		while (this._frameCache.size >= this._frameCacheSize) {
			let oldestKey: string | null = null;
			let oldestTime = Infinity;

			for (const [key, entry] of this._frameCache.entries()) {
				if (entry.lastAccess < oldestTime) {
					oldestTime = entry.lastAccess;
					oldestKey = key;
				}
			}

			if (oldestKey) {
				const entry = this._frameCache.get(oldestKey);
				if (entry) {
					entry.frame.close();
				}
				this._frameCache.delete(oldestKey);
			} else {
				break;
			}
		}

		// Clone frame for cache (original can be closed by caller)
		this._frameCache.set(cacheKey, {
			frame: frame.clone(),
			mediaUrl,
			time,
			lastAccess: Date.now(),
		});
	}

	/**
	 * Add image to cache with LRU eviction
	 */
	private _addToImageCache(url: string, bitmap: ImageBitmap): void {
		// Evict oldest if cache is full
		while (this._imageCache.size >= this._imageCacheSize) {
			let oldestUrl: string | null = null;
			let oldestTime = Infinity;

			for (const [cacheUrl, entry] of this._imageCache.entries()) {
				if (entry.lastAccess < oldestTime) {
					oldestTime = entry.lastAccess;
					oldestUrl = cacheUrl;
				}
			}

			if (oldestUrl) {
				const entry = this._imageCache.get(oldestUrl);
				if (entry) {
					entry.bitmap.close();
				}
				this._imageCache.delete(oldestUrl);
			} else {
				break;
			}
		}

		this._imageCache.set(url, {
			bitmap,
			url,
			lastAccess: Date.now(),
		});
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a CompatibleMediaFrameProvider instance
 */
export function createCompatibleMediaFrameProvider(
	mediaProxy: IMediaRequestProxy,
	config?: CompatibleMediaFrameProviderConfig
): CompatibleMediaFrameProvider {
	return new CompatibleMediaFrameProvider(mediaProxy, config);
}
