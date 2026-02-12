/**
 * AudioStreamClient - Opus audio stream player
 *
 * Connects to neko-engine's audio stream via WebSocket,
 * receives Opus encoded packets, decodes via WebCodecs AudioDecoder,
 * and plays via Web Audio API.
 *
 * Provides getCurrentTime() as master clock for A/V sync.
 *
 * Packet format (from Rust frame server):
 * [pts: i64 LE (8B)] [duration: i64 LE (8B)] [sample_rate: u32 LE (4B)] [channels: u16 LE (2B)] [Opus data...]
 */

const OPUS_HEADER_SIZE = 8 + 8 + 4 + 2; // pts(8) + duration(8) + sampleRate(4) + channels(2) = 22 bytes

function parseOpusPacket(data: ArrayBuffer): {
	pts: number;
	duration: number;
	sampleRate: number;
	channels: number;
	opusData: Uint8Array;
} | null {
	if (data.byteLength <= OPUS_HEADER_SIZE) return null;

	const view = new DataView(data);

	// pts: i64 LE (sample units)
	const ptsLow = view.getUint32(0, true);
	const ptsHigh = view.getInt32(4, true);
	const pts = ptsLow + ptsHigh * 0x100000000;

	// duration: i64 LE (sample units)
	const durLow = view.getUint32(8, true);
	const durHigh = view.getInt32(12, true);
	const duration = durLow + durHigh * 0x100000000;

	const sampleRate = view.getUint32(16, true);
	const channels = view.getUint16(20, true);

	const opusData = new Uint8Array(data, OPUS_HEADER_SIZE);

	return { pts, duration, sampleRate, channels, opusData };
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
	private decoder: AudioDecoder | null = null;
	private disposed = false;
	private isConnected = false;

	/** Offset between AudioContext.currentTime and media PTS */
	private ptsOffset: number | null = null;
	/** Next scheduled play time in AudioContext time */
	private nextPlayTime = 0;
	/** Sample rate from first packet (for PTS→seconds conversion) */
	private sampleRate = 48000;

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

		console.log('[AudioStreamClient] Connecting to:', this.config.websocketUrl);
		this.audioCtx = new AudioContext({ sampleRate: 48000 });
		this.gainNode = this.audioCtx.createGain();
		this.gainNode.gain.value = this.config.volume;
		this.gainNode.connect(this.audioCtx.destination);

		// Initialize WebCodecs AudioDecoder for Opus
		this.initDecoder();

		// Resume AudioContext immediately (browser autoplay policy)
		if (this.audioCtx.state === 'suspended') {
			try {
				await this.audioCtx.resume();
			} catch (e) {
				console.warn('[AudioStreamClient] AudioContext resume failed:', e);
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

		if (this.decoder && this.decoder.state !== 'closed') {
			this.decoder.close();
			this.decoder = null;
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
	// WebCodecs AudioDecoder
	// =========================================================================

	private initDecoder(): void {
		if (typeof AudioDecoder === 'undefined') {
			console.error('[AudioStreamClient] WebCodecs AudioDecoder not available');
			this.config.onError(new Error('WebCodecs AudioDecoder not supported'));
			return;
		}

		this.decoder = new AudioDecoder({
			output: (audioData: AudioData) => {
				this.handleDecodedAudio(audioData);
			},
			error: (e: DOMException) => {
				console.error('[AudioStreamClient] AudioDecoder error:', e);
			},
		});

		this.decoder.configure({
			codec: 'opus',
			sampleRate: 48000,
			numberOfChannels: 2,
		});
	}

	private handleDecodedAudio(audioData: AudioData): void {
		if (!this.audioCtx || !this.gainNode) {
			audioData.close();
			return;
		}

		const channels = audioData.numberOfChannels;
		const frames = audioData.numberOfFrames;
		const sr = audioData.sampleRate;

		if (frames <= 0) {
			audioData.close();
			return;
		}

		// Create AudioBuffer from decoded AudioData
		const audioBuffer = this.audioCtx.createBuffer(channels, frames, sr);

		for (let ch = 0; ch < channels; ch++) {
			const channelData = audioBuffer.getChannelData(ch);
			// AudioData.copyTo copies planar f32 data for the given plane
			audioData.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });
		}

		// PTS in seconds (audioData.timestamp is in microseconds)
		const ptsSeconds = audioData.timestamp / 1_000_000;

		// Initialize PTS offset on first decoded frame
		if (this.ptsOffset === null) {
			this.ptsOffset = this.audioCtx.currentTime - ptsSeconds;
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

		audioData.close();
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
	 * Reset audio clock and decoder state after a seek operation.
	 * Clears the PTS offset so the next packet re-establishes the clock.
	 */
	resetClock(): void {
		this.ptsOffset = null;
		this.nextPlayTime = 0;

		// Reset decoder to flush stale data
		if (this.decoder && this.decoder.state !== 'closed') {
			this.decoder.reset();
			this.decoder.configure({
				codec: 'opus',
				sampleRate: 48000,
				numberOfChannels: 2,
			});
		}
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
				console.log('[AudioStreamClient] WebSocket connected');

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

	private packetCount = 0;

	private handlePacket(data: ArrayBuffer): void {
		const packet = parseOpusPacket(data);
		if (!packet || !this.decoder || this.decoder.state === 'closed') {
			return;
		}

		this.packetCount++;
		if (this.packetCount <= 3 || this.packetCount % 200 === 0) {
			console.log(
				'[AudioStreamClient] Packet #' + this.packetCount,
				'pts=', packet.pts,
				'dur=', packet.duration,
				'sr=', packet.sampleRate,
				'ch=', packet.channels,
				'size=', packet.opusData.byteLength,
			);
		}

		this.sampleRate = packet.sampleRate;

		// Convert PTS from sample units to microseconds (WebCodecs convention)
		const timestampUs = (packet.pts / packet.sampleRate) * 1_000_000;
		const durationUs = (packet.duration / packet.sampleRate) * 1_000_000;

		try {
			const chunk = new EncodedAudioChunk({
				type: 'key', // Opus packets are always independently decodable
				timestamp: timestampUs,
				duration: durationUs,
				data: packet.opusData,
			});
			this.decoder.decode(chunk);
		} catch (e) {
			console.warn('[AudioStreamClient] Decode error:', e);
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
