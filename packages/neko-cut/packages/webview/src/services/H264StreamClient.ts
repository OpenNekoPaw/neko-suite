/**
 * H264StreamClient - H.264 流客户端
 *
 * 职责：
 * - 通过 WebSocket 连接 H.264 流端点 (/ws/h264)
 * - 使用 WebCodecs VideoDecoder 解码 H.264 NAL 单元
 * - 输出 VideoFrame 供 WebGPU 渲染使用
 *
 * 零拷贝数据流：
 * ```
 * WebSocket → H.264 NAL → WebCodecs VideoDecoder → VideoFrame → WebGPU 纹理
 * ```
 *
 * 性能优化：
 * - 硬件解码：WebCodecs 优先使用 GPU 硬件解码
 * - 零拷贝：VideoFrame 直接导入为 GPUExternalTexture
 * - 低延迟：无需 JPEG 编解码开销
 */

/**
 * H.264 packet header size
 * Format: [pts: i64 LE][dts: i64 LE][is_keyframe: u8][duration: i64 LE]
 */
const H264_HEADER_SIZE = 8 + 8 + 1 + 8;

/**
 * Parse H.264 packet message
 */
function parseH264Packet(data: ArrayBuffer): {
	pts: number;
	dts: number;
	isKeyframe: boolean;
	nalData: Uint8Array;
} | null {
	if (data.byteLength < H264_HEADER_SIZE) {
		console.warn('[H264StreamClient] Message too small for header');
		return null;
	}

	const view = new DataView(data);

	// Read header (little-endian)
	// pts: i64 (read as two u32)
	const ptsLow = view.getUint32(0, true);
	const ptsHigh = view.getInt32(4, true); // Signed for negative values
	const pts = ptsLow + ptsHigh * 0x100000000;

	// dts: i64
	const dtsLow = view.getUint32(8, true);
	const dtsHigh = view.getInt32(12, true);
	const dts = dtsLow + dtsHigh * 0x100000000;

	// is_keyframe: u8
	const isKeyframe = view.getUint8(16) === 1;

	// duration: i64 (skip, not needed for decoding)
	// bytes 17-24

	// NAL unit data (after header)
	const nalData = new Uint8Array(data, H264_HEADER_SIZE);

	return { pts, dts, isKeyframe, nalData };
}

export interface H264StreamClientConfig {
	/** WebSocket URL for H.264 stream (e.g., ws://127.0.0.1:PORT/ws/h264) */
	websocketUrl: string;
	/** Video width (for decoder config) */
	width: number;
	/** Video height (for decoder config) */
	height: number;
	/** Callback when frame is decoded */
	onFrame?: (frame: VideoFrame) => void;
	/** Callback on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
	/** Prefer hardware acceleration */
	preferHardware?: boolean;
}

export interface H264StreamClientStats {
	packetsReceived: number;
	framesDecoded: number;
	framesDropped: number;
	isConnected: boolean;
	isDecoderReady: boolean;
	avgDecodeTimeMs: number;
	avgLatencyMs: number;
	hardwareAcceleration: boolean;
}

/**
 * H.264 stream client with WebCodecs decoding
 */
export class H264StreamClient {
	private config: Required<H264StreamClientConfig>;
	private ws: WebSocket | null = null;
	private decoder: VideoDecoder | null = null;
	private disposed = false;

	// Stats
	private stats: H264StreamClientStats = {
		packetsReceived: 0,
		framesDecoded: 0,
		framesDropped: 0,
		isConnected: false,
		isDecoderReady: false,
		avgDecodeTimeMs: 0,
		avgLatencyMs: 0,
		hardwareAcceleration: false,
	};

	// For calculating averages
	private latencySamples: number[] = [];
	private readonly maxSamples = 60;

	// Pending frames for timing
	private pendingFrames: Map<number, number> = new Map(); // pts -> receiveTime

	// Reconnection
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectTimeout: number | null = null;

	// Latest frame for display
	private latestFrame: VideoFrame | null = null;

	constructor(config: H264StreamClientConfig) {
		this.config = {
			websocketUrl: config.websocketUrl,
			width: config.width,
			height: config.height,
			onFrame: config.onFrame ?? (() => {}),
			onConnectionChange: config.onConnectionChange ?? (() => {}),
			onError: config.onError ?? (() => {}),
			preferHardware: config.preferHardware ?? true,
		};
	}

	/**
	 * Connect to the H.264 stream
	 */
	async connect(): Promise<void> {
		if (this.disposed) {
			return;
		}

		console.log(`[H264StreamClient] Connecting to H.264 stream: ${this.config.websocketUrl}`);

		// Initialize decoder first
		await this.initDecoder();

		// Then connect WebSocket
		this.setupWebSocket();
	}

	/**
	 * Initialize WebCodecs VideoDecoder
	 */
	private async initDecoder(): Promise<void> {
		if (this.disposed) {
			return;
		}

		// Check WebCodecs support
		if (typeof VideoDecoder === 'undefined') {
			throw new Error('WebCodecs VideoDecoder not supported');
		}

		// Check codec support
		const codecConfig: VideoDecoderConfig = {
			codec: 'avc1.42E01E', // H.264 Baseline Profile Level 3.0
			codedWidth: this.config.width,
			codedHeight: this.config.height,
			hardwareAcceleration: this.config.preferHardware ? 'prefer-hardware' : 'prefer-software',
		};

		const support = await VideoDecoder.isConfigSupported(codecConfig);
		if (!support.supported) {
			// Try with different profile
			codecConfig.codec = 'avc1.4D401E'; // Main Profile
			const mainSupport = await VideoDecoder.isConfigSupported(codecConfig);
			if (!mainSupport.supported) {
				throw new Error('H.264 codec not supported');
			}
		}

		// Create decoder
		this.decoder = new VideoDecoder({
			output: (frame) => this.handleDecodedFrame(frame),
			error: (error) => {
				console.error('[H264StreamClient] Decoder error:', error);
				this.config.onError(error);
			},
		});

		// Configure decoder
		this.decoder.configure(codecConfig);
		this.stats.isDecoderReady = true;
		this.stats.hardwareAcceleration = this.config.preferHardware;

		console.log(
			`[H264StreamClient] Decoder initialized: ${this.config.width}x${this.config.height}, ` +
			`hw=${this.config.preferHardware}`
		);
	}

	/**
	 * Setup WebSocket connection
	 */
	private setupWebSocket(): void {
		if (this.disposed) {
			return;
		}

		try {
			this.ws = new WebSocket(this.config.websocketUrl);
			this.ws.binaryType = 'arraybuffer';

			this.ws.onopen = () => {
				console.log('[H264StreamClient] Connected');
				this.stats.isConnected = true;
				this.reconnectAttempts = 0;
				this.config.onConnectionChange(true);
			};

			this.ws.onclose = () => {
				console.log('[H264StreamClient] Disconnected');
				this.stats.isConnected = false;
				this.config.onConnectionChange(false);
				this.scheduleReconnect();
			};

			this.ws.onerror = (event) => {
				console.error('[H264StreamClient] WebSocket error:', event);
				this.config.onError(new Error('WebSocket connection error'));
			};

			this.ws.onmessage = (event) => {
				this.handleMessage(event.data as ArrayBuffer);
			};
		} catch (error) {
			console.error('[H264StreamClient] Failed to create WebSocket:', error);
			this.config.onError(error instanceof Error ? error : new Error(String(error)));
			this.scheduleReconnect();
		}
	}

	/**
	 * Handle incoming H.264 packet
	 */
	private handleMessage(data: ArrayBuffer): void {
		if (this.disposed || !this.decoder || this.decoder.state !== 'configured') {
			return;
		}

		this.stats.packetsReceived++;
		const receiveTime = performance.now();

		try {
			const parsed = parseH264Packet(data);
			if (!parsed) {
				console.warn('[H264StreamClient] Failed to parse H.264 packet');
				return;
			}

			const { pts, isKeyframe, nalData } = parsed;

			// Debug: Print H264 packet info
			console.log(`[H264StreamClient] Received H.264 packet: pts=${pts}, keyframe=${isKeyframe}, size=${nalData.byteLength}`);

			// Store receive time for latency calculation
			this.pendingFrames.set(pts, receiveTime);

			// Create EncodedVideoChunk
			const chunk = new EncodedVideoChunk({
				type: isKeyframe ? 'key' : 'delta',
				timestamp: pts, // Already in microseconds
				data: nalData,
			});

			// Decode
			this.decoder.decode(chunk);
		} catch (error) {
			console.error('[H264StreamClient] Failed to decode packet:', error);
		}
	}

	/**
	 * Handle decoded VideoFrame
	 */
	private handleDecodedFrame(frame: VideoFrame): void {
		if (this.disposed) {
			frame.close();
			return;
		}

		this.stats.framesDecoded++;

		// Calculate latency
		const receiveTime = this.pendingFrames.get(frame.timestamp);
		if (receiveTime !== undefined) {
			this.pendingFrames.delete(frame.timestamp);
			this.addLatencySample(performance.now() - receiveTime);
		}

		// Clean up old pending frames (prevent memory leak)
		if (this.pendingFrames.size > 100) {
			const oldestPts = Math.min(...this.pendingFrames.keys());
			this.pendingFrames.delete(oldestPts);
		}

		// Update latest frame
		if (this.latestFrame) {
			this.latestFrame.close();
		}
		this.latestFrame = frame.clone();

		// Notify callback
		this.config.onFrame(frame);
	}

	/**
	 * Schedule reconnection
	 */
	private scheduleReconnect(): void {
		if (this.disposed || this.reconnectAttempts >= this.maxReconnectAttempts) {
			return;
		}

		const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts), 5000);
		this.reconnectAttempts++;

		console.log(
			`[H264StreamClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
		);

		this.reconnectTimeout = window.setTimeout(() => {
			this.setupWebSocket();
		}, delay);
	}

	private addLatencySample(timeMs: number): void {
		this.latencySamples.push(timeMs);
		if (this.latencySamples.length > this.maxSamples) {
			this.latencySamples.shift();
		}
		this.stats.avgLatencyMs =
			this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
	}

	/**
	 * Get the latest decoded frame
	 */
	getLatestFrame(): VideoFrame | null {
		return this.latestFrame?.clone() ?? null;
	}

	/**
	 * Get current stats
	 */
	getStats(): H264StreamClientStats {
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

		if (this.decoder) {
			try {
				this.decoder.close();
			} catch {
				// Ignore close errors
			}
			this.decoder = null;
		}

		if (this.latestFrame) {
			this.latestFrame.close();
			this.latestFrame = null;
		}

		this.pendingFrames.clear();
		this.stats.isConnected = false;
		this.stats.isDecoderReady = false;
	}
}

export default H264StreamClient;
