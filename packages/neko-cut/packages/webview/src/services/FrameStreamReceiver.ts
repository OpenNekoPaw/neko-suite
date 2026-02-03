/**
 * FrameStreamReceiver - Localhost 帧流接收器
 *
 * 职责：
 * - 通过 WebSocket/HTTP 接收来自 Extension 的视频帧
 * - 绕过 VSCode postMessage 的结构化克隆开销
 * - 提供帧缓冲和背压控制
 *
 * 使用方式：
 * 1. MJPEG 模式：直接使用 <img src={mjpegUrl}> 标签
 * 2. WebSocket 模式：使用 FrameStreamReceiver 类接收帧
 */

export interface FrameStreamConfig {
	/** WebSocket URL (ws://127.0.0.1:PORT/ws) */
	websocketUrl: string;
	/** Maximum frames to buffer */
	maxBufferSize?: number;
	/** Callback when frame received */
	onFrame?: (frame: ImageBitmap) => void;
	/** Callback on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

export interface FrameStreamStats {
	framesReceived: number;
	framesDropped: number;
	isConnected: boolean;
	latencyMs: number;
}

/**
 * WebSocket-based frame stream receiver
 */
export class FrameStreamReceiver {
	private ws: WebSocket | null = null;
	private config: Required<FrameStreamConfig>;
	private frameBuffer: ImageBitmap[] = [];
	private stats: FrameStreamStats = {
		framesReceived: 0,
		framesDropped: 0,
		isConnected: false,
		latencyMs: 0,
	};
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectTimeout: number | null = null;
	private disposed = false;

	// Worker for off-main-thread decoding
	private decodeWorker: Worker | null = null;

	constructor(config: FrameStreamConfig) {
		this.config = {
			websocketUrl: config.websocketUrl,
			maxBufferSize: config.maxBufferSize ?? 3,
			onFrame: config.onFrame ?? (() => {}),
			onConnectionChange: config.onConnectionChange ?? (() => {}),
			onError: config.onError ?? (() => {}),
		};
	}

	/**
	 * Start receiving frames
	 */
	connect(): void {
		if (this.disposed) {
			return;
		}

		this.setupWebSocket();
	}

	private setupWebSocket(): void {
		if (this.disposed) {
			return;
		}

		try {
			this.ws = new WebSocket(this.config.websocketUrl);
			this.ws.binaryType = 'arraybuffer';

			this.ws.onopen = () => {
				console.log('[FrameStreamReceiver] Connected');
				this.stats.isConnected = true;
				this.reconnectAttempts = 0;
				this.config.onConnectionChange(true);
			};

			this.ws.onclose = () => {
				console.log('[FrameStreamReceiver] Disconnected');
				this.stats.isConnected = false;
				this.config.onConnectionChange(false);
				this.scheduleReconnect();
			};

			this.ws.onerror = (event) => {
				console.error('[FrameStreamReceiver] WebSocket error:', event);
				this.config.onError(new Error('WebSocket connection error'));
			};

			this.ws.onmessage = (event) => {
				this.handleMessage(event.data as ArrayBuffer);
			};
		} catch (error) {
			console.error('[FrameStreamReceiver] Failed to create WebSocket:', error);
			this.config.onError(error instanceof Error ? error : new Error(String(error)));
			this.scheduleReconnect();
		}
	}

	private async handleMessage(data: ArrayBuffer): Promise<void> {
		const startTime = performance.now();

		try {
			// Decode JPEG to ImageBitmap
			const blob = new Blob([data], { type: 'image/jpeg' });
			const bitmap = await createImageBitmap(blob);

			// Update stats
			this.stats.framesReceived++;
			this.stats.latencyMs = performance.now() - startTime;

			// Buffer management with backpressure
			if (this.frameBuffer.length >= this.config.maxBufferSize) {
				// Drop oldest frame
				const dropped = this.frameBuffer.shift();
				dropped?.close();
				this.stats.framesDropped++;
			}

			this.frameBuffer.push(bitmap);

			// Notify callback
			this.config.onFrame(bitmap);
		} catch (error) {
			console.error('[FrameStreamReceiver] Failed to decode frame:', error);
		}
	}

	private scheduleReconnect(): void {
		if (this.disposed || this.reconnectAttempts >= this.maxReconnectAttempts) {
			return;
		}

		const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts), 5000);
		this.reconnectAttempts++;

		console.log(
			`[FrameStreamReceiver] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
		);

		this.reconnectTimeout = window.setTimeout(() => {
			this.setupWebSocket();
		}, delay);
	}

	/**
	 * Get the latest frame from buffer
	 */
	getLatestFrame(): ImageBitmap | null {
		return this.frameBuffer[this.frameBuffer.length - 1] ?? null;
	}

	/**
	 * Pop a frame from buffer (for consumption)
	 */
	popFrame(): ImageBitmap | null {
		return this.frameBuffer.shift() ?? null;
	}

	/**
	 * Get current stats
	 */
	getStats(): FrameStreamStats {
		return { ...this.stats };
	}

	/**
	 * Disconnect and cleanup
	 */
	disconnect(): void {
		this.disposed = true;

		if (this.reconnectTimeout !== null) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		if (this.decodeWorker) {
			this.decodeWorker.terminate();
			this.decodeWorker = null;
		}

		// Clean up buffered frames
		for (const frame of this.frameBuffer) {
			frame.close();
		}
		this.frameBuffer = [];

		this.stats.isConnected = false;
	}
}

/**
 * Helper hook for React components
 */
export function createMjpegImageUrl(port: number): string {
	return `http://127.0.0.1:${port}/mjpeg`;
}

export function createWebSocketUrl(port: number): string {
	return `ws://127.0.0.1:${port}/ws`;
}

export function createSingleFrameUrl(port: number): string {
	return `http://127.0.0.1:${port}/frame`;
}
