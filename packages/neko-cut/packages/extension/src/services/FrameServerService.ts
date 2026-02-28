/**
 * FrameServerService - Localhost HTTP/WebSocket frame streaming service
 *
 * Wraps NativeEngine's embedded frame server for frame delivery
 * to Webview consumers via WebSocket.
 *
 * All frame production is handled by Rust side (pull mode).
 * Streams are created via dispatch("videos:stream" / "timelines:stream").
 *
 * Endpoints:
 * - ws://127.0.0.1:{port}/v1/streams/{stream_id} — per-stream WebSocket
 * - POST http://127.0.0.1:{port}/v1/dispatch — ActionRequest dispatch
 * - GET http://127.0.0.1:{port}/health — health check
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';

const logger = getLogger('FrameServerService');

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
	dispatch(requestJson: string): Promise<string>;
	hasGpu(): boolean;
}

interface NativeEngineModule {
	NativeEngine: { create(): Promise<NativeEngineInstance> };
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
 * provides ActionRequest dispatch for Webview consumers.
 */
export class FrameServerService implements vscode.Disposable {
	private _engine: NativeEngineInstance | null = null;
	private _port: number | null = null;
	private _disposed = false;

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
			logger.info('Loading native addon...');
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const addon = require('@neko-engine/native-napi') as NativeEngineModule;
			logger.info('Native addon loaded, creating NativeEngine...');

			this._engine = await addon.NativeEngine.create();
			logger.info(`NativeEngine created (GPU: ${this._engine.hasGpu() ? 'enabled' : 'disabled'})`);

			// Start the embedded HTTP/WebSocket server
			const requestedPort = config?.port ?? 0; // 0 = auto-assign
			this._port = await this._engine.startFrameServer(requestedPort);

			logger.info(
				`Frame server started on port ${this._port}`
			);

			return true;
		} catch (error) {
			logger.error(
				'Failed to initialize:',
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

		if (this._engine) {
			try {
				await this._engine.stopFrameServer();
				logger.info('Frame server stopped');
			} catch {
				// Ignore stop errors
			}
			this._engine = null;
		}

		this._port = null;
	}
}
