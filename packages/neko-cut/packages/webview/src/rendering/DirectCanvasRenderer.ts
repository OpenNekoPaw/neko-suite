/**
 * DirectCanvasRenderer - 直接 Canvas 渲染器
 *
 * 用于 Compatible 模式：Extension 端完成所有合成，Webview 只负责显示
 *
 * 数据流：
 * Extension (FFmpeg + wgpu 合成) → WebSocket (RGBA) → createImageBitmap → canvas.drawImage
 *
 * 背压控制：
 * - Webview 处理完一帧后发送 ACK
 * - Extension 收到 ACK 后才推送下一帧
 */

// =============================================================================
// Types
// =============================================================================

export interface DirectCanvasRendererConfig {
	/** Canvas element to render to */
	canvas: HTMLCanvasElement;
	/** Frame server WebSocket port */
	port: number;
	/** Callback when frame is displayed */
	onFrameDisplayed?: (stats: FrameDisplayStats) => void;
	/** Callback on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

export interface FrameDisplayStats {
	/** Frame timestamp in seconds */
	timestamp: number;
	/** Time to decode ArrayBuffer to ImageBitmap (ms) */
	decodeTime: number;
	/** Time to draw to canvas (ms) */
	drawTime: number;
	/** Total frame processing time (ms) */
	totalTime: number;
	/** Frame width */
	width: number;
	/** Frame height */
	height: number;
}

export interface DirectRendererStats {
	framesReceived: number;
	framesDisplayed: number;
	framesDropped: number;
	avgDecodeTime: number;
	avgDrawTime: number;
	currentFps: number;
	isConnected: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Frame message header size: timestamp_us (u64) + width (u32) + height (u32) */
const FRAME_HEADER_SIZE = 8 + 4 + 4;

/** ACK message to send back to server */
const ACK_MESSAGE = new Uint8Array([0x01]);

// =============================================================================
// DirectCanvasRenderer Class
// =============================================================================

export class DirectCanvasRenderer {
	private _canvas: HTMLCanvasElement;
	private _ctx: CanvasRenderingContext2D | null = null;
	private _ws: WebSocket | null = null;
	private _port: number;
	private _disposed = false;

	// Callbacks
	private _onFrameDisplayed?: (stats: FrameDisplayStats) => void;
	private _onConnectionChange?: (connected: boolean) => void;
	private _onError?: (error: Error) => void;

	// Stats
	private _framesReceived = 0;
	private _framesDisplayed = 0;
	private _framesDropped = 0;
	private _decodeTimeSamples: number[] = [];
	private _drawTimeSamples: number[] = [];
	private _fpsStartTime = 0;
	private _fpsFrameCount = 0;
	private _currentFps = 0;
	private readonly _maxSamples = 60;

	// Reconnection
	private _reconnectAttempts = 0;
	private _maxReconnectAttempts = 5;
	private _reconnectTimeout: number | null = null;

	// Playback state
	private _isPlaying = false;
	private _lastFrameTime = 0;

	constructor(config: DirectCanvasRendererConfig) {
		this._canvas = config.canvas;
		this._port = config.port;
		this._onFrameDisplayed = config.onFrameDisplayed;
		this._onConnectionChange = config.onConnectionChange;
		this._onError = config.onError;

		// Get 2D context
		this._ctx = this._canvas.getContext('2d', {
			alpha: false,
			desynchronized: true, // Reduce latency
		});

		if (!this._ctx) {
			throw new Error('Failed to get 2D canvas context');
		}
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	/**
	 * Connect to frame server
	 */
	connect(): void {
		if (this._disposed) return;
		this._setupWebSocket();
	}

	/**
	 * Disconnect from frame server
	 */
	disconnect(): void {
		this._cleanupWebSocket();
	}

	/**
	 * Start playback (begin accepting frames)
	 */
	startPlayback(): void {
		this._isPlaying = true;
		this._fpsStartTime = performance.now();
		this._fpsFrameCount = 0;
		console.log('[DirectCanvasRenderer] Playback started');
	}

	/**
	 * Stop playback
	 */
	stopPlayback(): void {
		this._isPlaying = false;
		console.log('[DirectCanvasRenderer] Playback stopped');
	}

	/**
	 * Get current stats
	 */
	getStats(): DirectRendererStats {
		return {
			framesReceived: this._framesReceived,
			framesDisplayed: this._framesDisplayed,
			framesDropped: this._framesDropped,
			avgDecodeTime: this._calculateAverage(this._decodeTimeSamples),
			avgDrawTime: this._calculateAverage(this._drawTimeSamples),
			currentFps: this._currentFps,
			isConnected: this._ws?.readyState === WebSocket.OPEN,
		};
	}

	/**
	 * Get last frame time
	 */
	get lastFrameTime(): number {
		return this._lastFrameTime;
	}

	/**
	 * Check if playing
	 */
	get isPlaying(): boolean {
		return this._isPlaying;
	}

	/**
	 * Check if connected
	 */
	get isConnected(): boolean {
		return this._ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Resize canvas
	 */
	resize(width: number, height: number): void {
		this._canvas.width = width;
		this._canvas.height = height;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		this._isPlaying = false;
		this._cleanupWebSocket();

		console.log('[DirectCanvasRenderer] Disposed');
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	private _setupWebSocket(): void {
		if (this._disposed) return;

		try {
			const url = `ws://127.0.0.1:${this._port}/ws`;
			console.log(`[DirectCanvasRenderer] Connecting to ${url}`);

			this._ws = new WebSocket(url);
			this._ws.binaryType = 'arraybuffer';

			this._ws.onopen = () => {
				console.log('[DirectCanvasRenderer] Connected');
				this._reconnectAttempts = 0;
				this._onConnectionChange?.(true);
			};

			this._ws.onclose = () => {
				console.log('[DirectCanvasRenderer] Disconnected');
				this._onConnectionChange?.(false);
				this._scheduleReconnect();
			};

			this._ws.onerror = (event) => {
				console.error('[DirectCanvasRenderer] WebSocket error:', event);
				this._onError?.(new Error('WebSocket connection error'));
			};

			this._ws.onmessage = (event) => {
				this._handleMessage(event.data as ArrayBuffer);
			};
		} catch (error) {
			console.error('[DirectCanvasRenderer] Failed to create WebSocket:', error);
			this._onError?.(error instanceof Error ? error : new Error(String(error)));
			this._scheduleReconnect();
		}
	}

	private _cleanupWebSocket(): void {
		if (this._reconnectTimeout !== null) {
			clearTimeout(this._reconnectTimeout);
			this._reconnectTimeout = null;
		}

		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}
	}

	private _scheduleReconnect(): void {
		if (this._disposed || this._reconnectAttempts >= this._maxReconnectAttempts) {
			return;
		}

		const delay = Math.min(100 * Math.pow(2, this._reconnectAttempts), 5000);
		this._reconnectAttempts++;

		console.log(
			`[DirectCanvasRenderer] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`
		);

		this._reconnectTimeout = window.setTimeout(() => {
			this._setupWebSocket();
		}, delay);
	}

	/**
	 * Handle incoming frame message
	 * Format: [timestamp_us: u64 LE][width: u32 LE][height: u32 LE][rgba_data...]
	 */
	private async _handleMessage(data: ArrayBuffer): Promise<void> {
		const totalStart = performance.now();
		this._framesReceived++;

		// Parse header
		if (data.byteLength < FRAME_HEADER_SIZE) {
			console.warn('[DirectCanvasRenderer] Message too small');
			this._sendAck();
			return;
		}

		const view = new DataView(data);

		// Read timestamp (u64 LE)
		const timestampUsLow = view.getUint32(0, true);
		const timestampUsHigh = view.getUint32(4, true);
		const timestampUs = timestampUsLow + timestampUsHigh * 0x100000000;
		const timestampSec = timestampUs / 1_000_000;

		// Read dimensions
		const width = view.getUint32(8, true);
		const height = view.getUint32(12, true);

		// Extract image data
		const imageData = data.slice(FRAME_HEADER_SIZE);

		// If not playing, just send ACK and return
		if (!this._isPlaying) {
			this._sendAck();
			return;
		}

		try {
			// Decode to ImageBitmap
			const decodeStart = performance.now();

			// Check if data is JPEG or raw RGBA
			const isJpeg = imageData.byteLength > 2 &&
				new Uint8Array(imageData)[0] === 0xFF &&
				new Uint8Array(imageData)[1] === 0xD8;

			let bitmap: ImageBitmap;
			if (isJpeg) {
				// JPEG data
				const blob = new Blob([imageData], { type: 'image/jpeg' });
				bitmap = await createImageBitmap(blob);
			} else {
				// Raw RGBA data
				const rgbaData = new Uint8ClampedArray(imageData);
				const imgData = new ImageData(rgbaData, width, height);
				bitmap = await createImageBitmap(imgData);
			}

			const decodeTime = performance.now() - decodeStart;

			// Draw to canvas
			const drawStart = performance.now();

			if (this._ctx) {
				// Resize canvas if needed
				if (this._canvas.width !== width || this._canvas.height !== height) {
					this._canvas.width = width;
					this._canvas.height = height;
				}

				this._ctx.drawImage(bitmap, 0, 0);
			}

			const drawTime = performance.now() - drawStart;

			// Close bitmap
			bitmap.close();

			// Update stats
			this._framesDisplayed++;
			this._lastFrameTime = timestampSec;
			this._addSample(this._decodeTimeSamples, decodeTime);
			this._addSample(this._drawTimeSamples, drawTime);
			this._updateFps();

			// Notify callback
			const totalTime = performance.now() - totalStart;
			this._onFrameDisplayed?.({
				timestamp: timestampSec,
				decodeTime,
				drawTime,
				totalTime,
				width,
				height,
			});
		} catch (error) {
			console.error('[DirectCanvasRenderer] Failed to display frame:', error);
			this._framesDropped++;
		}

		// Send ACK for backpressure control
		this._sendAck();
	}

	/**
	 * Send ACK to server (backpressure control)
	 */
	private _sendAck(): void {
		if (this._ws?.readyState === WebSocket.OPEN) {
			this._ws.send(ACK_MESSAGE);
		}
	}

	private _addSample(samples: number[], value: number): void {
		samples.push(value);
		if (samples.length > this._maxSamples) {
			samples.shift();
		}
	}

	private _calculateAverage(samples: number[]): number {
		if (samples.length === 0) return 0;
		return samples.reduce((a, b) => a + b, 0) / samples.length;
	}

	private _updateFps(): void {
		this._fpsFrameCount++;
		const elapsed = performance.now() - this._fpsStartTime;

		if (elapsed >= 1000) {
			this._currentFps = (this._fpsFrameCount / elapsed) * 1000;
			this._fpsStartTime = performance.now();
			this._fpsFrameCount = 0;
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDirectCanvasRenderer(
	config: DirectCanvasRendererConfig
): DirectCanvasRenderer {
	return new DirectCanvasRenderer(config);
}
