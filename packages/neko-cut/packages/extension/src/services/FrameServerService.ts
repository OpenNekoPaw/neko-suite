/**
 * FrameServerService - Localhost HTTP/WebSocket frame streaming service
 *
 * Wraps NativeEngine's embedded frame server for high-performance
 * frame delivery to Webview consumers via WebSocket.
 *
 * New architecture (NativeEngine):
 * - Frame server is embedded in NativeEngine (Rust HTTP/WS server)
 * - Frames are pushed per-stream via pushStreamFrame()
 * - Streams are created via createStream() with WebSocket endpoints
 * - ActionRequest dispatch available via HTTP POST
 *
 * Endpoints:
 * - ws://127.0.0.1:{port}/v1/streams/{stream_id} — per-stream WebSocket
 * - POST http://127.0.0.1:{port}/v1/dispatch — ActionRequest dispatch
 * - GET http://127.0.0.1:{port}/health — health check
 */

import * as vscode from 'vscode';

// =============================================================================
// Types (matching NativeEngine NAPI interface)
// =============================================================================

/**
 * NativeEngine instance type — subset of methods used by FrameServerService
 */
interface NativeEngineInstance {
	startFrameServer(port?: number | null): Promise<number>;
	stopFrameServer(): Promise<void>;
	getFrameServerPort(): number | null;
	createStream(
		sessionId: string,
		resourceId: string,
		width?: number | null,
		height?: number | null,
		fps?: number | null
	): Promise<string>;
	pushStreamFrame(
		streamId: string,
		data: Buffer,
		width: number,
		height: number,
		timestamp: number,
		format?: string | null
	): void;
	dispatch(requestJson: string): Promise<string>;
	hasGpu(): boolean;
}

interface NativeEngineModule {
	NativeEngine: { create(): Promise<NativeEngineInstance> };
}

/**
 * Stream info returned by createStream()
 */
export interface StreamInfo {
	streamId: string;
	wsUrl: string;
	wsPort: number;
}

/**
 * Frame server configuration
 */
export interface FrameServerConfig {
	port?: number;
}

// =============================================================================
// FrameServerService
// =============================================================================

/**
 * Frame server service backed by NativeEngine
 *
 * Manages the embedded HTTP/WebSocket server lifecycle and
 * provides per-stream frame pushing for Webview consumers.
 */
export class FrameServerService implements vscode.Disposable {
	private _engine: NativeEngineInstance | null = null;
	private _port: number | null = null;
	private _disposed = false;

	// Track active streams for cleanup
	private _activeStreams: Map<string, StreamInfo> = new Map();

	/**
	 * Try to create a FrameServerService instance
	 * Returns null if native addon is unavailable
	 */
	static async tryCreate(config?: FrameServerConfig): Promise<FrameServerService | null> {
		const service = new FrameServerService();
		const initialized = await service.initialize(config);

		if (initialized) {
			return service;
		}

		await service.dispose();
		return null;
	}

	private constructor() {
		// Private constructor - use tryCreate()
	}

	/**
	 * Initialize the frame server via NativeEngine
	 */
	private async initialize(config?: FrameServerConfig): Promise<boolean> {
		try {
			console.log('[FrameServerService] Loading native addon...');
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const addon = require('@neko-engine/native-napi') as NativeEngineModule;
			console.log('[FrameServerService] Native addon loaded, creating NativeEngine...');

			this._engine = await addon.NativeEngine.create();
			console.log(`[FrameServerService] NativeEngine created (GPU: ${this._engine.hasGpu() ? 'enabled' : 'disabled'})`);

			// Start the embedded HTTP/WebSocket server
			const requestedPort = config?.port ?? 0; // 0 = auto-assign
			this._port = await this._engine.startFrameServer(requestedPort);

			console.log(
				`[FrameServerService] Frame server started on port ${this._port}`
			);

			return true;
		} catch (error) {
			console.error(
				'[FrameServerService] Failed to initialize:',
				error instanceof Error ? error.message : error,
				error instanceof Error ? error.stack : ''
			);
			return false;
		}
	}

	// =========================================================================
	// Properties
	// =========================================================================

	/**
	 * Whether the service is available
	 */
	isAvailable(): boolean {
		return this._engine !== null && this._port !== null && !this._disposed;
	}

	/**
	 * Get the frame server port
	 */
	getPort(): number | null {
		return this._port;
	}

	/**
	 * Get the underlying NativeEngine instance
	 * Useful for consumers that need direct dispatch access
	 */
	getEngine(): NativeEngineInstance | null {
		return this._engine;
	}

	/**
	 * Get the base URL for the frame server
	 */
	getBaseUrl(): string | null {
		if (!this._port) return null;
		return `http://127.0.0.1:${this._port}`;
	}

	/**
	 * Get the WebSocket base URL for streams
	 */
	getWebSocketBaseUrl(): string | null {
		if (!this._port) return null;
		return `ws://127.0.0.1:${this._port}/v1/streams`;
	}

	/**
	 * Get the health check URL
	 */
	getHealthUrl(): string | null {
		if (!this._port) return null;
		return `http://127.0.0.1:${this._port}/health`;
	}

	/**
	 * Get the dispatch URL for ActionRequest
	 */
	getDispatchUrl(): string | null {
		if (!this._port) return null;
		return `http://127.0.0.1:${this._port}/v1/dispatch`;
	}

	// =========================================================================
	// Stream Management
	// =========================================================================

	/**
	 * Create a new stream and return its WebSocket endpoint info
	 *
	 * @param sessionId - Unique session identifier (e.g., document URI)
	 * @param resourceId - Resource identifier (e.g., video path)
	 * @param width - Optional output width
	 * @param height - Optional output height
	 * @param fps - Optional frame rate
	 * @returns Stream info with WebSocket URL, or null if unavailable
	 */
	async createStream(
		sessionId: string,
		resourceId: string,
		width?: number,
		height?: number,
		fps?: number
	): Promise<StreamInfo | null> {
		if (!this._engine || this._disposed) {
			return null;
		}

		try {
			const responseJson = await this._engine.createStream(
				sessionId,
				resourceId,
				width ?? null,
				height ?? null,
				fps ?? null
			);
			const response = JSON.parse(responseJson) as {
				success: boolean;
				data?: { streamId: string; wsUrl: string; wsPort: number };
				error?: string;
			};

			if (!response.success || !response.data) {
				console.error('[FrameServerService] Failed to create stream:', response.error);
				return null;
			}

			const streamInfo: StreamInfo = {
				streamId: response.data.streamId,
				wsUrl: response.data.wsUrl,
				wsPort: response.data.wsPort,
			};

			this._activeStreams.set(streamInfo.streamId, streamInfo);

			console.log(
				`[FrameServerService] Stream created: ${streamInfo.streamId} → ${streamInfo.wsUrl}`
			);

			return streamInfo;
		} catch (error) {
			console.error('[FrameServerService] createStream error:', error);
			return null;
		}
	}

	/**
	 * Push a frame to a specific stream
	 *
	 * This is a synchronous, high-frequency method optimized for 30-60fps.
	 *
	 * @param streamId - Target stream ID
	 * @param data - Frame pixel data (RGBA, NV12, or JPEG)
	 * @param width - Frame width
	 * @param height - Frame height
	 * @param timestamp - Frame timestamp in microseconds
	 * @param format - Pixel format ('rgba' | 'nv12' | 'jpeg'), defaults to 'jpeg'
	 */
	pushFrame(
		streamId: string,
		data: Buffer,
		width: number,
		height: number,
		timestamp: number,
		format?: string
	): void {
		if (!this._engine || this._disposed) {
			return;
		}

		this._engine.pushStreamFrame(streamId, data, width, height, timestamp, format ?? null);
	}

	/**
	 * Get list of active stream IDs
	 */
	getActiveStreams(): string[] {
		return Array.from(this._activeStreams.keys());
	}

	/**
	 * Get stream info by ID
	 */
	getStreamInfo(streamId: string): StreamInfo | undefined {
		return this._activeStreams.get(streamId);
	}

	// =========================================================================
	// Dispatch (ActionRequest proxy)
	// =========================================================================

	/**
	 * Dispatch an ActionRequest through the engine
	 * Useful for keyframe cache warmup and other engine operations
	 */
	async dispatch(requestJson: string): Promise<string> {
		if (!this._engine || this._disposed) {
			throw new Error('FrameServerService not available');
		}

		return this._engine.dispatch(requestJson);
	}

	// =========================================================================
	// Disposal
	// =========================================================================

	/**
	 * Dispose resources and stop the frame server
	 */
	async dispose(): Promise<void> {
		if (this._disposed) {
			return;
		}

		this._disposed = true;

		// Clear active streams
		this._activeStreams.clear();

		if (this._engine) {
			try {
				await this._engine.stopFrameServer();
				console.log('[FrameServerService] Frame server stopped');
			} catch {
				// Ignore stop errors
			}
			this._engine = null;
		}

		this._port = null;
	}
}
