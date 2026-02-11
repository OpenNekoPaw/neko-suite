/**
 * AudioStreamClient - PCM F32 audio stream player
 *
 * Connects to neko-engine's audio stream via WebSocket,
 * receives PCM F32 data with PTS headers, and plays via Web Audio API.
 *
 * Provides getCurrentTime() as master clock for A/V sync.
 *
 * Packet format (from Rust frame server):
 * [pts_seconds: f64 LE (8B)] [sample_rate: u32 LE (4B)] [channels: u32 LE (4B)] [PCM F32 data...]
 */

const PCM_HEADER_SIZE = 8 + 4 + 4; // pts(8) + sampleRate(4) + channels(4) = 16 bytes

function parsePcmPacket(data: ArrayBuffer): {
	pts: number;
	sampleRate: number;
	channels: number;
	pcmData: Float32Array;
} | null {
	if (data.byteLength <= PCM_HEADER_SIZE) return null;

	const view = new DataView(data);
	const pts = view.getFloat64(0, true);
	const sampleRate = view.getUint32(8, true);
	const channels = view.getUint32(12, true);

	// PCM F32 data starts after header
	const pcmBytes = new Uint8Array(data, PCM_HEADER_SIZE);
	const pcmData = new Float32Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 4);

	return { pts, sampleRate, channels, pcmData };
}

// =============================================================================
// Types
// =============================================================================

export interface AudioStreamClientConfig {
	/** WebSocket URL for audio stream */
	websocketUrl: string;
	/** Initial volume (0.0 - 1.0) */
	volume?: number;
	/** Callback on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

// =============================================================================
// AudioStreamClient
// =============================================================================

export class AudioStreamClient {
	private config: Required<AudioStreamClientConfig>;
	private ws: WebSocket | null = null;
	private audioCtx: AudioContext | null = null;
	private gainNode: GainNode | null = null;
	private disposed = false;
	private isConnected = false;

	/** Offset between AudioContext.currentTime and media PTS */
	private ptsOffset: number | null = null;
	/** Next scheduled play time in AudioContext time */
	private nextPlayTime = 0;

	// Reconnection
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: AudioStreamClientConfig) {
		this.config = {
			websocketUrl: config.websocketUrl,
			volume: config.volume ?? 1.0,
			onConnectionChange: config.onConnectionChange ?? (() => {}),
			onError: config.onError ?? (() => {}),
		};
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async connect(): Promise<void> {
		if (this.disposed) return;

		this.audioCtx = new AudioContext({ sampleRate: 48000 });
		this.gainNode = this.audioCtx.createGain();
		this.gainNode.gain.value = this.config.volume;
		this.gainNode.connect(this.audioCtx.destination);

		// Resume AudioContext immediately (browser autoplay policy)
		if (this.audioCtx.state === 'suspended') {
			try {
				await this.audioCtx.resume();
			} catch {
				// Will retry on WebSocket open
			}
		}

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

		if (this.audioCtx && this.audioCtx.state !== 'closed') {
			this.audioCtx.close().catch(() => {});
			this.audioCtx = null;
		}

		this.gainNode = null;
		this.isConnected = false;
		this.ptsOffset = null;
	}

	// =========================================================================
	// Master Clock
	// =========================================================================

	/**
	 * Get current playback time in media PTS seconds.
	 * Used as master clock for A/V sync.
	 */
	getCurrentTime(): number {
		if (!this.audioCtx || this.ptsOffset === null) return 0;
		return this.audioCtx.currentTime - this.ptsOffset;
	}

	/**
	 * Whether the audio clock is ready (has received at least one packet)
	 */
	get isClockReady(): boolean {
		return this.ptsOffset !== null;
	}

	// =========================================================================
	// Volume
	// =========================================================================

	setVolume(volume: number): void {
		this.config.volume = Math.max(0, Math.min(1, volume));
		if (this.gainNode) {
			this.gainNode.gain.value = this.config.volume;
		}
	}

	// =========================================================================
	// Seek Reset
	// =========================================================================

	/**
	 * Reset audio clock state after a seek operation.
	 * Clears the PTS offset so the next packet re-establishes the clock.
	 */
	resetClock(): void {
		this.ptsOffset = null;
		this.nextPlayTime = 0;
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
				this.isConnected = true;
				this.reconnectAttempts = 0;
				this.config.onConnectionChange(true);

				// Resume AudioContext if suspended (browser autoplay policy)
				if (this.audioCtx?.state === 'suspended') {
					this.audioCtx.resume().catch(() => {});
				}
			};

			this.ws.onmessage = (event) => {
				if (event.data instanceof ArrayBuffer) {
					this.handlePacket(event.data);
				}
			};

			this.ws.onclose = () => {
				this.isConnected = false;
				this.config.onConnectionChange(false);
				this.tryReconnect();
			};

			this.ws.onerror = (event) => {
				console.error('[AudioStreamClient] WebSocket error:', event);
			};
		} catch (error) {
			console.error('[AudioStreamClient] WebSocket setup failed:', error);
			this.tryReconnect();
		}
	}

	private handlePacket(data: ArrayBuffer): void {
		const packet = parsePcmPacket(data);
		if (!packet || !this.audioCtx || !this.gainNode) return;

		const { pts, sampleRate, channels, pcmData } = packet;
		const samplesPerChannel = pcmData.length / channels;

		if (samplesPerChannel <= 0) return;

		// Create AudioBuffer
		const audioBuffer = this.audioCtx.createBuffer(channels, samplesPerChannel, sampleRate);

		// Deinterleave PCM data into separate channel buffers
		for (let ch = 0; ch < channels; ch++) {
			const channelData = audioBuffer.getChannelData(ch);
			for (let i = 0; i < samplesPerChannel; i++) {
				channelData[i] = pcmData[i * channels + ch] ?? 0;
			}
		}

		// Initialize PTS offset on first packet
		if (this.ptsOffset === null) {
			this.ptsOffset = this.audioCtx.currentTime - pts;
			this.nextPlayTime = this.audioCtx.currentTime;
		}

		// Schedule playback
		const source = this.audioCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(this.gainNode);

		// If we're behind, catch up
		const now = this.audioCtx.currentTime;
		if (this.nextPlayTime < now) {
			this.nextPlayTime = now;
		}

		source.start(this.nextPlayTime);
		this.nextPlayTime += audioBuffer.duration;
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
