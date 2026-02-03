/**
 * WebviewMediaFrameProvider - Pure Webview frame provider
 *
 * Implements IMediaFrameProvider using WebCodecs + mp4box.js for video decoding
 * directly in the Webview, avoiding IPC overhead for supported formats.
 *
 * Supported formats (basic mode):
 * - Video: H.264, VP8, VP9
 * - Audio: AAC, MP3, Opus, Vorbis, FLAC (via libav.js)
 *
 * Unsupported formats will trigger a prompt to switch to compatible mode.
 */

import type { IMediaFrameProvider, CompositeTrackConfig, UrlResolver } from './types';
import {
	WebviewVideoDecoder,
	createWebviewVideoDecoder,
	isWebCodecsAvailable,
	checkBasicModeSupport,
	type FormatSupportResult,
} from '../../../mediaEngine/decoders/WebviewVideoDecoder';
import { isVideoCodecSupported } from '../../../mediaEngine/demuxers';
import { getLocalMediaProcessor } from '../../../services/mediaProxyFactory';

// =============================================================================
// Types
// =============================================================================

/**
 * Basic mode unsupported reason
 */
export enum BasicModeUnsupportedReason {
	CODEC_NOT_SUPPORTED = 'codec_not_supported',
	FILE_ACCESS_DENIED = 'file_access_denied',
	WEBCODECS_NOT_AVAILABLE = 'webcodecs_not_available',
	DEMUX_FAILED = 'demux_failed',
}

/**
 * Basic mode error
 */
export interface BasicModeError {
	reason: BasicModeUnsupportedReason;
	message: string;
	suggestion: string;
	details?: string;
}

/**
 * Provider configuration
 */
export interface WebviewMediaFrameProviderConfig {
	/** URL resolver for converting paths to webview URIs */
	urlResolver?: UrlResolver;
	/** Maximum decoder instances (default: 4) */
	maxDecoderInstances?: number;
	/** Frame buffer size per decoder (default: 30) */
	frameBufferSize?: number;
	/** Image cache size (default: 50) */
	imageCacheSize?: number;
	/** Callback when basic mode is not supported */
	onBasicModeUnsupported?: (error: BasicModeError) => void;
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
 * Decoder entry in the pool
 */
interface DecoderEntry {
	decoder: WebviewVideoDecoder;
	url: string;
	lastAccess: number;
}

/**
 * Image cache entry
 */
interface ImageCacheEntry {
	bitmap: ImageBitmap;
	lastAccess: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_DECODER_INSTANCES = 6; // Support up to 6 concurrent video tracks
const DEFAULT_IMAGE_CACHE_SIZE = 50;

// Global memory budget (kept for getMemoryStats)
const GLOBAL_FRAME_BUDGET = 180;

// =============================================================================
// WebviewMediaFrameProvider Class
// =============================================================================

export class WebviewMediaFrameProvider implements IMediaFrameProvider {
	private _config: WebviewMediaFrameProviderConfig;
	private _urlResolver: UrlResolver | undefined;
	private _disposed = false;

	// Decoder pool
	private _decoderPool: Map<string, DecoderEntry> = new Map();
	private _maxDecoderInstances: number;

	// Image cache
	private _imageCache: Map<string, ImageCacheEntry> = new Map();
	private _imageCacheSize: number;

	// URL cache
	private _urlCache: Map<string, string> = new Map();

	constructor(config: WebviewMediaFrameProviderConfig = {}) {
		this._config = config;
		this._urlResolver = config.urlResolver;
		this._maxDecoderInstances = config.maxDecoderInstances ?? DEFAULT_MAX_DECODER_INSTANCES;
		this._imageCacheSize = config.imageCacheSize ?? DEFAULT_IMAGE_CACHE_SIZE;
	}

	// ===========================================================================
	// IMediaFrameProvider Implementation
	// ===========================================================================

	/**
	 * Get a video frame at the specified time
	 */
	async getVideoFrame(
		_elementId: string,
		mediaUrl: string,
		time: number,
		_nonBlocking = false
	): Promise<VideoFrame | null> {
		if (this._disposed) return null;

		try {
			// Resolve URL
			const resolvedUrl = await this._resolveUrl(mediaUrl);

			// Get or create decoder (pass original path for Extension Host file reading)
			const decoder = await this._getOrCreateDecoder(resolvedUrl, mediaUrl);
			if (!decoder) {
				return null;
			}

			// Get frame - decoder returns a cloned VideoFrame
			const frame = await decoder.getFrameAt(time);
			if (!frame) {
				return null;
			}

			// Return the frame directly - it already has the correct timestamp
			// The caller is responsible for closing the frame when done
			return frame;
		} catch (error) {
			console.error('[WebviewMediaFrameProvider] Error getting video frame:', error);
			this._handleError(error);
			return null;
		}
	}

	/**
	 * Get composite video frame (multi-track)
	 * @deprecated Use GPURenderEngine for GPU-based multi-track composition
	 */
	async getCompositeVideoFrame(
		_elementId: string,
		_tracks: CompositeTrackConfig[],
		_time: number,
		_width: number,
		_height: number,
		_nonBlocking = false
	): Promise<VideoFrame | null> {
		console.warn(
			'[WebviewMediaFrameProvider] getCompositeVideoFrame is deprecated. ' +
				'Use GPURenderEngine for GPU-based multi-track composition.'
		);
		return null;
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

			// Resolve URL
			const resolvedUrl = await this._resolveUrl(imageUrl);

			// Fetch and create ImageBitmap
			const response = await fetch(resolvedUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch image: ${response.status}`);
			}

			const blob = await response.blob();
			const bitmap = await createImageBitmap(blob);

			// Add to cache
			this._addToImageCache(imageUrl, bitmap);

			return bitmap;
		} catch (error) {
			console.error('[WebviewMediaFrameProvider] Error getting image:', error);
			return null;
		}
	}

	/**
	 * Preload a media file
	 */
	async preload(mediaUrl: string): Promise<void> {
		if (this._disposed) return;

		const ext = mediaUrl.toLowerCase().split('.').pop();
		const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
		const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

		if (videoExts.includes(ext ?? '')) {
			const resolvedUrl = await this._resolveUrl(mediaUrl);
			await this._getOrCreateDecoder(resolvedUrl, mediaUrl);
		} else if (imageExts.includes(ext ?? '')) {
			await this.getImageBitmap('preload', mediaUrl);
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		// Close all decoders
		for (const entry of this._decoderPool.values()) {
			entry.decoder.close().catch(() => {
				// Ignore errors during dispose
			});
		}
		this._decoderPool.clear();

		// Close all cached images
		for (const entry of this._imageCache.values()) {
			entry.bitmap.close();
		}
		this._imageCache.clear();

		// Clear URL cache
		this._urlCache.clear();
	}

	/**
	 * Get cached frame count
	 */
	getCachedFrameCount(): number {
		let count = 0;
		for (const entry of this._decoderPool.values()) {
			count += entry.decoder.getCachedFrameCount?.() ?? 0;
		}
		return count;
	}

	/**
	 * Get global memory stats for debugging
	 */
	getMemoryStats(): {
		decoderCount: number;
		totalFrames: number;
		perDecoderBufferSize: number;
		globalBudget: number;
	} {
		return {
			decoderCount: this._decoderPool.size,
			totalFrames: 0, // Zero-copy: no buffered frames
			perDecoderBufferSize: 0,
			globalBudget: GLOBAL_FRAME_BUDGET,
		};
	}

	/**
	 * Get aggregated decode statistics from all decoders
	 */
	getDecodeStats(): { avgDecodeTime: number; totalDecodeCount: number } {
		let totalDecodeTime = 0;
		let totalDecodeCount = 0;

		for (const entry of this._decoderPool.values()) {
			const stats = entry.decoder.getDecodeStats();
			totalDecodeTime += stats.avgDecodeTime * stats.decodeCount;
			totalDecodeCount += stats.decodeCount;
		}

		return {
			avgDecodeTime: totalDecodeCount > 0 ? totalDecodeTime / totalDecodeCount : 0,
			totalDecodeCount,
		};
	}

	/**
	 * Reset decode statistics for all decoders
	 */
	resetDecodeStats(): void {
		for (const entry of this._decoderPool.values()) {
			entry.decoder.resetDecodeStats();
		}
	}

	// ===========================================================================
	// Public Methods
	// ===========================================================================

	/**
	 * Set URL resolver
	 */
	setUrlResolver(resolver: UrlResolver | undefined): void {
		if (this._urlResolver === resolver) return;
		this._urlResolver = resolver;
		this._urlCache.clear();
	}

	/**
	 * Check if a video format is supported in basic mode
	 */
	async checkFormatSupport(codec: string): Promise<FormatSupportResult> {
		return checkBasicModeSupport(codec);
	}

	/**
	 * Check if WebCodecs is available
	 */
	isWebCodecsAvailable(): boolean {
		return isWebCodecsAvailable();
	}

	/**
	 * Get decoder pool size
	 */
	get decoderPoolSize(): number {
		return this._decoderPool.size;
	}

	/**
	 * Get image cache size
	 */
	get imageCacheSize(): number {
		return this._imageCache.size;
	}

	/**
	 * Clear decoder pool
	 */
	clearDecoderPool(): void {
		for (const entry of this._decoderPool.values()) {
			entry.decoder.close().catch(() => {
				// Ignore
			});
		}
		this._decoderPool.clear();
	}

	/**
	 * Clear image cache
	 */
	clearImageCache(): void {
		for (const entry of this._imageCache.values()) {
			entry.bitmap.close();
		}
		this._imageCache.clear();
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Resolve URL using the URL resolver
	 */
	private async _resolveUrl(path: string): Promise<string> {
		const cached = this._urlCache.get(path);
		if (cached) return cached;

		let resolved: string;
		if (this._urlResolver) {
			resolved = await this._urlResolver(path);
		} else {
			resolved = path;
		}

		this._urlCache.set(path, resolved);
		return resolved;
	}

	/**
	 * Get or create a decoder for the given URL
	 * @param url - Resolved webview URI
	 * @param filePath - Original file path (for Extension Host file reading)
	 */
	private async _getOrCreateDecoder(url: string, filePath?: string): Promise<WebviewVideoDecoder | null> {
		// Check existing decoder
		const existing = this._decoderPool.get(url);
		if (existing) {
			existing.lastAccess = Date.now();
			return existing.decoder;
		}

		// Check WebCodecs availability
		if (!isWebCodecsAvailable()) {
			console.error('[WebviewMediaFrameProvider] WebCodecs not available!');
			this._notifyBasicModeUnsupported({
				reason: BasicModeUnsupportedReason.WEBCODECS_NOT_AVAILABLE,
				message: 'WebCodecs is not available in this environment.',
				suggestion: 'Please switch to compatible mode.',
			});
			return null;
		}

		// Evict oldest decoder if pool is full
		if (this._decoderPool.size >= this._maxDecoderInstances) {
			this._evictOldestDecoder();
		}

		// Create new decoder
		try {
			const decoder = createWebviewVideoDecoder({
				source: url,
				filePath, // Enable Extension Host file reading for Range requests
				useAnnexB: this._config.useAnnexB,
			});

			// Open decoder (initializes demuxer and checks codec support)
			const mediaInfo = await decoder.open();

			// Check codec support
			if (mediaInfo.video) {
				const support = await isVideoCodecSupported(mediaInfo.video.codec);
				if (!support.supported) {
					console.error(`[WebviewMediaFrameProvider] Codec not supported: ${mediaInfo.video.codec}`);
					await decoder.close();
					this._notifyBasicModeUnsupported({
						reason: BasicModeUnsupportedReason.CODEC_NOT_SUPPORTED,
						message: `Video codec "${mediaInfo.video.codec}" is not supported in basic mode.`,
						suggestion: 'Please switch to compatible mode for full format support.',
						details: support.reason,
					});
					return null;
				}
			}

			// Add to pool
			this._decoderPool.set(url, {
				decoder,
				url,
				lastAccess: Date.now(),
			});

			// Preload keyframes for fast seek and print keyframe list
			this._preloadAndLogKeyframes(decoder, url, filePath);

			return decoder;
		} catch (error) {
			console.error('[WebviewMediaFrameProvider] Failed to create decoder:', error);

			// Determine error type
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorMessage.includes('codec') || errorMessage.includes('Unsupported')) {
				this._notifyBasicModeUnsupported({
					reason: BasicModeUnsupportedReason.CODEC_NOT_SUPPORTED,
					message: errorMessage,
					suggestion: 'Please switch to compatible mode for full format support.',
				});
			} else if (errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
				this._notifyBasicModeUnsupported({
					reason: BasicModeUnsupportedReason.FILE_ACCESS_DENIED,
					message: 'Cannot access the video file in basic mode.',
					suggestion: 'Please switch to compatible mode.',
					details: errorMessage,
				});
			} else {
				this._notifyBasicModeUnsupported({
					reason: BasicModeUnsupportedReason.DEMUX_FAILED,
					message: 'Failed to parse the video file.',
					suggestion: 'Please switch to compatible mode.',
					details: errorMessage,
				});
			}

			return null;
		}
	}

	/**
	 * Preload keyframes and log the keyframe list
	 * Runs in background, non-blocking
	 * For fragmented MP4, tries to get keyframe times from mfra box
	 */
	private async _preloadAndLogKeyframes(decoder: WebviewVideoDecoder, url: string, filePath?: string): Promise<void> {
		try {
			// Get keyframe times from demuxer
			let keyframeTimes = await decoder.getKeyframeTimes();

			// For fragmented MP4, demuxer may only have partial keyframes
			// Try to get complete keyframe list from mfra box
			if (keyframeTimes.length < 10 && filePath) {
				console.log('[WebviewMediaFrameProvider] Few keyframes detected, trying mfra fallback...');
				try {
					const mediaInfo = decoder.mediaInfo;
					const videoTimescale = mediaInfo?.video?.timescale ?? 60000;
					const mfraKeyframes = await getLocalMediaProcessor().getKeyframeTimesFromMfra(filePath, videoTimescale);
					if (mfraKeyframes && mfraKeyframes.length > keyframeTimes.length) {
						console.log(`[WebviewMediaFrameProvider] Got ${mfraKeyframes.length} keyframes from mfra box`);
						keyframeTimes = mfraKeyframes;
					}
				} catch (e) {
					console.warn('[WebviewMediaFrameProvider] mfra fallback failed:', e);
				}
			}

			// Log keyframe list
			const fileName = url.split('/').pop() || url;
			console.log(`[WebviewMediaFrameProvider] Keyframe list for "${fileName}":`);
			console.log(`  Total keyframes: ${keyframeTimes.length}`);
			if (keyframeTimes.length > 0) {
				console.log(`  Keyframe times (seconds): [${keyframeTimes.slice(0, 20).map(t => t.toFixed(3)).join(', ')}${keyframeTimes.length > 20 ? ', ...' : ''}]`);
				console.log(`  First keyframe: ${keyframeTimes[0]?.toFixed(3)}s`);
				console.log(`  Last keyframe: ${keyframeTimes[keyframeTimes.length - 1]?.toFixed(3)}s`);

				// Calculate average GOP size
				if (keyframeTimes.length > 1) {
					const gaps: number[] = [];
					for (let i = 1; i < keyframeTimes.length; i++) {
						const prev = keyframeTimes[i - 1];
						const curr = keyframeTimes[i];
						if (prev !== undefined && curr !== undefined) {
							gaps.push(curr - prev);
						}
					}
					const avgGop = gaps.reduce((a, b) => a + b, 0) / gaps.length;
					console.log(`  Average GOP duration: ${avgGop.toFixed(3)}s`);
				}
			}

			// Preload keyframes in background (limit to first 50 for performance)
			// For fragmented MP4, we pass the mfra keyframe times but only demuxer-available frames will be preloaded
			const preloadCount = Math.min(50, keyframeTimes.length);
			console.log(`[WebviewMediaFrameProvider] Preloading ${preloadCount} keyframes...`);

			// Pass keyframeTimes to preloadKeyframes for fragmented MP4 support
			const preloaded = await decoder.preloadKeyframes(preloadCount, undefined, keyframeTimes);
			console.log(`[WebviewMediaFrameProvider] Preloaded ${preloaded} keyframes successfully`);

			// Note: For fragmented MP4, only first fragment keyframes can be preloaded
			// Other keyframes will be loaded on-demand when seeking
			if (preloaded < preloadCount) {
				console.log(`[WebviewMediaFrameProvider] Note: Only ${preloaded}/${preloadCount} keyframes available in loaded fragments`);
			}

			// Log cache stats
			const cacheStats = decoder.getKeyframeCacheStats();
			console.log(`[WebviewMediaFrameProvider] Keyframe cache: ${cacheStats.count} frames cached`);
		} catch (error) {
			console.warn('[WebviewMediaFrameProvider] Failed to preload keyframes:', error);
		}
	}

	/**
	 * Evict the oldest decoder from the pool
	 */
	private _evictOldestDecoder(): void {
		let oldestUrl: string | null = null;
		let oldestTime = Infinity;

		for (const [url, entry] of this._decoderPool.entries()) {
			if (entry.lastAccess < oldestTime) {
				oldestTime = entry.lastAccess;
				oldestUrl = url;
			}
		}

		if (oldestUrl) {
			const entry = this._decoderPool.get(oldestUrl);
			if (entry) {
				entry.decoder.close().catch(() => {
					// Ignore
				});
			}
			this._decoderPool.delete(oldestUrl);
		}
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
			lastAccess: Date.now(),
		});
	}

	/**
	 * Notify that basic mode is not supported
	 */
	private _notifyBasicModeUnsupported(error: BasicModeError): void {
		console.warn('[WebviewMediaFrameProvider] Basic mode unsupported:', error);

		if (this._config.onBasicModeUnsupported) {
			this._config.onBasicModeUnsupported(error);
		}
	}

	/**
	 * Handle errors
	 */
	private _handleError(error: unknown): void {
		if (!error || typeof error !== 'object') return;

		const errorMessage = (error as { message?: string }).message ?? '';

		// Check for specific error types
		if (errorMessage.includes('codec') || errorMessage.includes('Unsupported')) {
			this._notifyBasicModeUnsupported({
				reason: BasicModeUnsupportedReason.CODEC_NOT_SUPPORTED,
				message: errorMessage,
				suggestion: 'Please switch to compatible mode for full format support.',
			});
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a WebviewMediaFrameProvider instance
 */
export function createWebviewMediaFrameProvider(
	config?: WebviewMediaFrameProviderConfig
): WebviewMediaFrameProvider {
	return new WebviewMediaFrameProvider(config);
}

// =============================================================================
// Singleton
// =============================================================================

let _instance: WebviewMediaFrameProvider | null = null;

/**
 * Get the singleton WebviewMediaFrameProvider instance
 */
export function getWebviewMediaFrameProvider(): WebviewMediaFrameProvider {
	if (!_instance) {
		_instance = new WebviewMediaFrameProvider();
	}
	return _instance;
}

/**
 * Dispose the singleton instance
 */
export function disposeWebviewMediaFrameProvider(): void {
	if (_instance) {
		_instance.dispose();
		_instance = null;
	}
}
