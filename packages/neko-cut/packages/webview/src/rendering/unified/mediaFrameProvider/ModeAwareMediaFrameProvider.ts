/**
 * ModeAwareMediaFrameProvider - Routes requests based on media engine mode
 *
 * Implements IMediaFrameProvider and delegates to either:
 * - WebviewMediaFrameProvider for basic mode (WebCodecs + WebGPU in Webview)
 * - CompatibleMediaFrameProvider for compatible mode (FFmpeg + wgpu in Extension)
 *
 * The mode is determined by reading `currentMode` from the editor store,
 * which is set by the Extension based on user preference and media analysis.
 */

import type { IMediaFrameProvider, CompositeTrackConfig } from './types';
import type { WebviewMediaFrameProvider } from './WebviewMediaFrameProvider';
import type { CompatibleMediaFrameProvider } from './CompatibleMediaFrameProvider';
import type { MediaEngineMode } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * Mode getter function type
 * Returns the current media engine mode from editor store
 */
export type ModeGetter = () => MediaEngineMode | null;

/**
 * Provider configuration
 */
export interface ModeAwareMediaFrameProviderConfig {
	/** Webview provider for basic mode */
	webviewProvider: WebviewMediaFrameProvider;
	/** Compatible provider for compatible mode (can be lazy-initialized) */
	compatibleProvider: CompatibleMediaFrameProvider | null;
	/** Function to get current mode */
	getMode: ModeGetter;
}

// =============================================================================
// ModeAwareMediaFrameProvider Class
// =============================================================================

export class ModeAwareMediaFrameProvider implements IMediaFrameProvider {
	private _webviewProvider: WebviewMediaFrameProvider;
	private _compatibleProvider: CompatibleMediaFrameProvider | null;
	private _getMode: ModeGetter;
	private _disposed = false;

	constructor(config: ModeAwareMediaFrameProviderConfig) {
		this._webviewProvider = config.webviewProvider;
		this._compatibleProvider = config.compatibleProvider;
		this._getMode = config.getMode;
	}

	// ===========================================================================
	// Provider Management
	// ===========================================================================

	/**
	 * Set the compatible provider (for lazy initialization)
	 */
	setCompatibleProvider(provider: CompatibleMediaFrameProvider): void {
		this._compatibleProvider = provider;
	}

	/**
	 * Set frame server port for compatible provider
	 * Enables high-performance WebSocket-based frame delivery
	 */
	setFrameServerPort(port: number): void {
		if (this._compatibleProvider) {
			this._compatibleProvider.setFrameServerPort(port);
			console.log(`[ModeAwareMediaFrameProvider] Frame server port set to ${port}`);
		}
	}

	/**
	 * Set video dimensions for H264 decoder in compatible provider
	 */
	setVideoDimensions(width: number, height: number): void {
		if (this._compatibleProvider) {
			this._compatibleProvider.setVideoDimensions(width, height);
			console.log(`[ModeAwareMediaFrameProvider] Video dimensions set to ${width}x${height}`);
		}
	}

	/**
	 * Get current active provider based on mode
	 */
	private _getActiveProvider(): IMediaFrameProvider {
		const mode = this._getMode();

		// Default to webview provider if mode is not set or is 'basic'
		if (mode === null || mode === 'basic') {
			return this._webviewProvider;
		}

		// Use compatible provider for 'compatible' mode
		if (mode === 'compatible' && this._compatibleProvider) {
			return this._compatibleProvider;
		}

		// Fallback to webview provider
		return this._webviewProvider;
	}

	/**
	 * Check if currently using webview provider
	 */
	get isUsingWebviewProvider(): boolean {
		const mode = this._getMode();
		return mode === null || mode === 'basic';
	}

	/**
	 * Check if currently using compatible provider
	 */
	get isUsingCompatibleProvider(): boolean {
		const mode = this._getMode();
		return mode === 'compatible' && this._compatibleProvider !== null;
	}

	/**
	 * Get current mode
	 */
	get currentMode(): MediaEngineMode | null {
		return this._getMode();
	}

	// ===========================================================================
	// IMediaFrameProvider Implementation
	// ===========================================================================

	/**
	 * Get a video frame at the specified time
	 */
	async getVideoFrame(
		elementId: string,
		mediaUrl: string,
		time: number,
		nonBlocking = false
	): Promise<VideoFrame | null> {
		if (this._disposed) return null;

		const provider = this._getActiveProvider();
		return provider.getVideoFrame(elementId, mediaUrl, time, nonBlocking);
	}

	/**
	 * Get composite video frame (multi-track)
	 */
	async getCompositeVideoFrame(
		elementId: string,
		tracks: CompositeTrackConfig[],
		time: number,
		width: number,
		height: number,
		nonBlocking = false
	): Promise<VideoFrame | null> {
		if (this._disposed) return null;

		const provider = this._getActiveProvider();
		return provider.getCompositeVideoFrame(
			elementId,
			tracks,
			time,
			width,
			height,
			nonBlocking
		);
	}

	/**
	 * Get an image as ImageBitmap
	 */
	async getImageBitmap(
		elementId: string,
		imageUrl: string
	): Promise<ImageBitmap | null> {
		if (this._disposed) return null;

		const provider = this._getActiveProvider();
		return provider.getImageBitmap(elementId, imageUrl);
	}

	/**
	 * Preload a media file
	 */
	async preload(mediaUrl: string): Promise<void> {
		if (this._disposed) return;

		const provider = this._getActiveProvider();
		return provider.preload(mediaUrl);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		// Dispose both providers
		this._webviewProvider.dispose();
		this._compatibleProvider?.dispose();
	}

	/**
	 * Get cached frame count
	 */
	getCachedFrameCount(): number {
		const mode = this._getMode();
		if (mode === 'compatible' && this._compatibleProvider) {
			return this._compatibleProvider.getCachedFrameCount?.() ?? 0;
		}
		return this._webviewProvider.getCachedFrameCount?.() ?? 0;
	}

	// ===========================================================================
	// Extended Methods (delegated to webview provider when applicable)
	// ===========================================================================

	/**
	 * Set URL resolver (webview provider only)
	 */
	setUrlResolver(resolver: ((path: string) => Promise<string>) | undefined): void {
		this._webviewProvider.setUrlResolver(resolver);
	}

	/**
	 * Get memory stats (webview provider only)
	 */
	getMemoryStats(): {
		decoderCount: number;
		totalFrames: number;
		perDecoderBufferSize: number;
		globalBudget: number;
	} {
		return this._webviewProvider.getMemoryStats();
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a ModeAwareMediaFrameProvider instance
 */
export function createModeAwareMediaFrameProvider(
	webviewProvider: WebviewMediaFrameProvider,
	compatibleProvider: CompatibleMediaFrameProvider | null,
	getMode: ModeGetter
): ModeAwareMediaFrameProvider {
	return new ModeAwareMediaFrameProvider({
		webviewProvider,
		compatibleProvider,
		getMode,
	});
}
