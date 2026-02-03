/**
 * Video Frame Provider
 *
 * Provides frame data for video layers using native FFmpeg decoding.
 */

import type { TrackLayer, FrameProvider } from './ExportService';

// Types from native module
interface MediaProcessorType {
	decodeFrame(config: { path: string; hwAccel?: string; outputFormat?: string }, timeSeconds: number): {
		width: number;
		height: number;
		format: string;
		data: Buffer;
		timestamp: number;
		isKeyframe: boolean;
	};
}

interface MediaProcessorModule {
	MediaProcessor: {
		create(): Promise<MediaProcessorType>;
	};
}

// =============================================================================
// Frame Cache
// =============================================================================

interface CachedFrame {
	data: Buffer;
	width: number;
	height: number;
	timestamp: number;
}

class FrameCache {
	private _cache: Map<string, CachedFrame> = new Map();
	private _maxSize: number;

	constructor(maxSize: number = 30) {
		this._maxSize = maxSize;
	}

	private _makeKey(source: string, time: number): string {
		// Round time to nearest frame (assuming 30fps)
		const roundedTime = Math.round(time * 30) / 30;
		return `${source}:${roundedTime.toFixed(3)}`;
	}

	get(source: string, time: number): CachedFrame | null {
		const key = this._makeKey(source, time);
		return this._cache.get(key) ?? null;
	}

	set(source: string, time: number, frame: CachedFrame): void {
		// Evict oldest entries if cache is full
		if (this._cache.size >= this._maxSize) {
			const firstKey = this._cache.keys().next().value;
			if (firstKey) {
				this._cache.delete(firstKey);
			}
		}

		const key = this._makeKey(source, time);
		this._cache.set(key, frame);
	}

	clear(): void {
		this._cache.clear();
	}
}

// =============================================================================
// Video Frame Provider
// =============================================================================

export class VideoFrameProvider implements FrameProvider {
	private _processor: MediaProcessorType | null = null;
	private _nativeModule: MediaProcessorModule | null = null;
	private _cache: FrameCache;
	private _initialized = false;

	constructor() {
		this._cache = new FrameCache(30);
	}

	/**
	 * Initialize the frame provider by loading the native module
	 */
	async initialize(): Promise<void> {
		if (this._initialized) return;

		try {
			this._nativeModule = await import('@neko-engine/native-napi') as unknown as MediaProcessorModule;
			this._processor = await this._nativeModule.MediaProcessor.create();
			this._initialized = true;
			console.log('[VideoFrameProvider] Initialized successfully');
		} catch (error) {
			console.error('[VideoFrameProvider] Failed to initialize:', error);
			throw new Error(`VideoFrameProvider initialization failed: ${error}`);
		}
	}

	/**
	 * Get frame data for a layer at a specific time
	 */
	async getFrameData(
		layer: TrackLayer,
		localTime: number
	): Promise<{ data: Buffer; width: number; height: number } | null> {
		if (!this._processor) {
			throw new Error('VideoFrameProvider not initialized');
		}

		// Only handle video and image layers with sources
		if (!layer.source) {
			return null;
		}

		if (layer.type !== 'video' && layer.type !== 'image') {
			// TODO: Handle text, shape, effect layers
			return null;
		}

		// Check cache first
		const cached = this._cache.get(layer.source, localTime);
		if (cached) {
			return {
				data: cached.data,
				width: cached.width,
				height: cached.height,
			};
		}

		try {
			// Decode frame at the specified time
			const frame = this._processor.decodeFrame(
				{ path: layer.source },
				localTime
			);

			// Cache the result
			this._cache.set(layer.source, localTime, {
				data: frame.data,
				width: frame.width,
				height: frame.height,
				timestamp: frame.timestamp,
			});

			return {
				data: frame.data,
				width: frame.width,
				height: frame.height,
			};
		} catch (error) {
			console.error(`[VideoFrameProvider] Failed to decode frame for ${layer.source} at ${localTime}:`, error);
			return null;
		}
	}

	/**
	 * Clear the frame cache
	 */
	clearCache(): void {
		this._cache.clear();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._cache.clear();
		this._processor = null;
		this._nativeModule = null;
		this._initialized = false;
	}
}

/**
 * Create and initialize a VideoFrameProvider
 */
export async function createVideoFrameProvider(): Promise<VideoFrameProvider> {
	const provider = new VideoFrameProvider();
	await provider.initialize();
	return provider;
}
