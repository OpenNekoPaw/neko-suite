/**
 * H264StreamClient - Lightweight H.264 stream decoder for preview
 *
 * Connects to neko-engine's frame server via WebSocket,
 * receives H.264 NAL units, and decodes them using WebCodecs.
 *
 * Packet format (from Rust frame server):
 * [pts: i64 LE (8B)] [dts: i64 LE (8B)] [is_keyframe: u8 (1B)] [NAL data...]
 */

const H264_HEADER_SIZE = 8 + 8 + 1; // 17 bytes

function parseH264Packet(data: ArrayBuffer): {
	pts: number;
	dts: number;
	isKeyframe: boolean;
	nalData: Uint8Array;
} | null {
	if (data.byteLength < H264_HEADER_SIZE) return null;

	const view = new DataView(data);

	const ptsLow = view.getUint32(0, true);
	const ptsHigh = view.getInt32(4, true);
	const pts = ptsLow + ptsHigh * 0x100000000;

	const dtsLow = view.getUint32(8, true);
	const dtsHigh = view.getInt32(12, true);
	const dts = dtsLow + dtsHigh * 0x100000000;

	const isKeyframe = view.getUint8(16) === 1;
	const nalData = new Uint8Array(data, H264_HEADER_SIZE);

	return { pts, dts, isKeyframe, nalData };
}

// =============================================================================
// Types
// =============================================================================

export interface H264StreamClientConfig {
	/** WebSocket URL (e.g., ws://127.0.0.1:PORT/ws/h264) */
	websocketUrl: string;
	/** Video width for decoder config */
	width: number;
	/** Video height for decoder config */
	height: number;
	/** Callback when a frame is decoded */
	onFrame?: (frame: VideoFrame) => void;
	/** Callback on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

export interface H264StreamStats {
	packetsReceived: number;
	framesDecoded: number;
	framesDropped: number;
	isConnected: boolean;
	isDecoderReady: boolean;
}

// =============================================================================
// H264StreamClient
// =============================================================================

export class H264StreamClient {
	private config: Required<H264StreamClientConfig>;
	private ws: WebSocket | null = null;
	private decoder: VideoDecoder | null = null;
	private disposed = false;

	private stats: H264StreamStats = {
		packetsReceived: 0,
		framesDecoded: 0,
		framesDropped: 0,
		isConnected: false,
		isDecoderReady: false,
	};

	// Reconnection
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: H264StreamClientConfig) {
		this.config = {
			websocketUrl: config.websocketUrl,
			width: config.width,
			height: config.height,
			onFrame: config.onFrame ?? (() => {}),
			onConnectionChange: config.onConnectionChange ?? (() => {}),
			onError: config.onError ?? (() => {}),
		};
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async connect(): Promise<void> {
		if (this.disposed) return;

		await this.initDecoder();
		this.setupWebSocket();
	}

	dispose(): void {
		this.disposed = true;

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.onclose = null;
			this.ws.close();
			this.ws = null;
		}

		if (this.decoder && this.decoder.state !== 'closed') {
			try {
				this.decoder.close();
			} catch {
				// Ignore
			}
			this.decoder = null;
		}

		this.stats.isConnected = false;
		this.stats.isDecoderReady = false;
	}

	getStats(): H264StreamStats {
		return { ...this.stats };
	}

	// =========================================================================
	// WebCodecs Decoder
	// =========================================================================

	private async initDecoder(): Promise<void> {
		if (typeof VideoDecoder === 'undefined') {
			this.config.onError(new Error('WebCodecs VideoDecoder not available'));
			return;
		}

		// Check codec support
		const codecString = 'avc1.42E01E'; // H.264 Baseline Profile Level 3.0
		const support = await VideoDecoder.isConfigSupported({
			codec: codecString,
			hardwareAcceleration: 'prefer-hardware',
		});

		if (!support.supported) {
			this.config.onError(new Error(`H.264 codec not supported: ${codecString}`));
			return;
		}

		this.decoder = new VideoDecoder({
			output: (frame) => {
				this.stats.framesDecoded++;
				this.config.onFrame(frame);
			},
			error: (error) => {
				console.error('[H264StreamClient] Decoder error:', error);
				this.stats.isDecoderReady = false;
				this.config.onError(error);
			},
		});

		this.decoder.configure({
			codec: codecString,
			hardwareAcceleration: 'prefer-hardware',
			optimizeForLatency: true,
		});

		this.stats.isDecoderReady = true;
	}

	// =========================================================================
	// WebSocket
	// =========================================================================

	private setupWebSocket(): void {
		if (this.disposed) return;

		try {
			this.ws = new WebSocket(this.config.websocketUrl);
			this.ws.binaryType = 'arraybuffer';

			this.ws.onopen = () => {
				this.stats.isConnected = true;
				this.reconnectAttempts = 0;
				this.config.onConnectionChange(true);
			};

			this.ws.onmessage = (event) => {
				if (event.data instanceof ArrayBuffer) {
					this.handlePacket(event.data);
				}
			};

			this.ws.onclose = () => {
				this.stats.isConnected = false;
				this.config.onConnectionChange(false);
				this.tryReconnect();
			};

			this.ws.onerror = (event) => {
				console.error('[H264StreamClient] WebSocket error:', event);
			};
		} catch (error) {
			console.error('[H264StreamClient] WebSocket setup failed:', error);
			this.tryReconnect();
		}
	}

	private handlePacket(data: ArrayBuffer): void {
		this.stats.packetsReceived++;

		const packet = parseH264Packet(data);
		if (!packet) return;

		if (!this.decoder || this.decoder.state !== 'configured') {
			this.stats.framesDropped++;
			return;
		}

		try {
			const chunk = new EncodedVideoChunk({
				type: packet.isKeyframe ? 'key' : 'delta',
				timestamp: packet.pts,
				data: packet.nalData,
			});
			this.decoder.decode(chunk);
		} catch (error) {
			this.stats.framesDropped++;
			console.warn('[H264StreamClient] Decode error:', error);
		}
	}

	private tryReconnect(): void {
		if (this.disposed || this.reconnectAttempts >= this.maxReconnectAttempts) {
			return;
		}

		this.reconnectAttempts++;
		const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts), 5000);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.setupWebSocket();
		}, delay);
	}
}
