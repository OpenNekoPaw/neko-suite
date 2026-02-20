/**
 * AudioStreamClient - PCM f32le audio stream player
 *
 * Connects to neko-engine's audio stream via WebSocket,
 * receives raw PCM f32le samples, and plays via Web Audio API.
 * No decoding step needed — samples are directly written to AudioBuffers.
 *
 * Provides getCurrentTime() as master clock for A/V sync.
 *
 * Packet format (from Rust frame server):
 * [pts_us: i64 LE (8B)] [duration_us: i64 LE (8B)] [sample_rate: u32 LE (4B)] [channels: u16 LE (2B)] [interleaved f32le PCM...]
 * PTS and duration are in microseconds.
 */

const PCM_HEADER_SIZE = 8 + 8 + 4 + 2; // pts(8) + duration(8) + sampleRate(4) + channels(2) = 22 bytes

function parsePcmPacket(data: ArrayBuffer): {
	pts: number;
	duration: number;
	sampleRate: number;
	channels: number;
	pcmData: Uint8Array;
} | null {
	if (data.byteLength <= PCM_HEADER_SIZE) return null;

	const view = new DataView(data);

	// pts: i64 LE (microseconds)
	const ptsLow = view.getUint32(0, true);
	const ptsHigh = view.getInt32(4, true);
	const pts = ptsLow + ptsHigh * 0x100000000;

	// duration: i64 LE (microseconds)
	const durLow = view.getUint32(8, true);
	const durHigh = view.getInt32(12, true);
	const duration = durLow + durHigh * 0x100000000;

	const sampleRate = view.getUint32(16, true);
	const channels = view.getUint16(20, true);

	// slice() creates a new ArrayBuffer starting at offset 0 (4-byte aligned for Float32Array)
	const pcmData = new Uint8Array(data.slice(PCM_HEADER_SIZE));

	return { pts, duration, sampleRate, channels, pcmData };
}

// =============================================================================
// Types
// =============================================================================

export interface AudioStreamClientConfig {
	/** WebSocket URL for audio stream */
	websocketUrl: string;
	/** Initial volume (0.0 - 1.0) */
	volume?: number;
	/** Fade-in duration in seconds (0 to disable) */
	fadeInDuration?: number;
	/** Fade-out duration in seconds (0 to disable) */
	fadeOutDuration?: number;
	/** Callback on connection state change */
	onConnectionChange?: (connected: boolean) => void;
	/** Callback on error */
	onError?: (error: Error) => void;
}

export interface AudioStreamStats {
	packetsReceived: number;
	isClockReady: boolean;
	currentPtsSeconds: number;
	prebuffering: boolean;
	driftMs: number;
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
	/** Sample rate from first packet */
	private sampleRate = 48000;

	/** Last time (audioCtx.currentTime) drift calibration was performed */
	private lastCalibrationTime = 0;

	// --- Prebuffer ---
	/** Duration (seconds) of audio to accumulate before starting playback */
	private static readonly PREBUFFER_DURATION = 0.5;
	/** Queue of decoded buffers waiting during prebuffer phase */
	private prebufferQueue: Array<{ audioBuffer: AudioBuffer; ptsSeconds: number }> = [];
	/** Accumulated duration (seconds) in the prebuffer queue */
	private prebufferAccum = 0;
	/** Whether we are in the prebuffer phase (waiting for enough data) */
	private isPrebuffering = true;

	/** Last measured drift in milliseconds (for stats) */
	private lastDriftMs = 0;

	/** Whether audio output is paused (gain muted, new packets discarded) */
	private isPaused = false;

	/**
	 * Seek generation counter. Incremented on resetClock().
	 * Packets arriving during prebuffer whose generation is stale are discarded,
	 * preventing pre-seek PCM data from leaking into the post-seek buffer.
	 */
	private seekGeneration = 0;

	/** Shorter prebuffer after seek (WebSocket already connected, low latency) */
	private static readonly SEEK_PREBUFFER_DURATION = 0.15;

	// Reconnection
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	/** Default fade durations (seconds) */
	private static readonly DEFAULT_FADE_IN = 0.15;
	private static readonly DEFAULT_FADE_OUT = 0.15;

	constructor(config: AudioStreamClientConfig) {
		this.config = {
			websocketUrl: config.websocketUrl,
			volume: config.volume ?? 1.0,
			fadeInDuration: config.fadeInDuration ?? AudioStreamClient.DEFAULT_FADE_IN,
			fadeOutDuration: config.fadeOutDuration ?? AudioStreamClient.DEFAULT_FADE_OUT,
			onConnectionChange: config.onConnectionChange ?? (() => {}),
			onError: config.onError ?? (() => {}),
		};
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Connect to the audio stream.
	 * @param existingAudioCtx Optional pre-created AudioContext (e.g. from a user gesture)
	 *                         to satisfy browser autoplay policy.
	 */
	async connect(existingAudioCtx?: AudioContext): Promise<void> {
		if (this.disposed) return;

		console.log('[AudioStreamClient] Connecting to:', this.config.websocketUrl);

		if (existingAudioCtx) {
			this.audioCtx = existingAudioCtx;
		} else {
			this.audioCtx = new AudioContext({ sampleRate: 48000 });
		}

		this.gainNode = this.audioCtx.createGain();
		this.gainNode.gain.value = this.config.volume;
		this.gainNode.connect(this.audioCtx.destination);

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

		if (this.audioCtx && this.audioCtx.state !== 'closed') {
			this.audioCtx.close().catch(() => {});
			this.audioCtx = null;
		}

		this.gainNode = null;
		this.isConnected = false;
		this.ptsOffset = null;
	}

	// =========================================================================
	// Scheduling logic
	// =========================================================================

	/** Drift calibration interval in seconds of AudioContext time */
	private static readonly CALIBRATION_INTERVAL = 5;
	/** Minimum drift (seconds) worth correcting */
	private static readonly DRIFT_MIN = 0.005;
	/** Maximum drift (seconds) before we consider it a discontinuity */
	private static readonly DRIFT_MAX = 1.0;
	/** Correction factor per calibration (smooth, not instant) */
	private static readonly DRIFT_CORRECTION = 0.5;

	private scheduleBuffer(audioBuffer: AudioBuffer, ptsSeconds: number): void {
		if (!this.audioCtx || !this.gainNode) return;

		// --- Prebuffer phase: accumulate data before starting playback ---
		if (this.isPrebuffering) {
			this.prebufferQueue.push({ audioBuffer, ptsSeconds });
			this.prebufferAccum += audioBuffer.duration;

			// Use shorter prebuffer after seek (WebSocket already connected)
			const threshold = this.seekGeneration > 0
				? AudioStreamClient.SEEK_PREBUFFER_DURATION
				: AudioStreamClient.PREBUFFER_DURATION;

			if (this.prebufferAccum < threshold) {
				return; // Keep accumulating
			}

			// Prebuffer complete — establish clock and flush queue
			const now = this.audioCtx.currentTime;
			const firstPts = this.prebufferQueue[0]!.ptsSeconds;
			this.ptsOffset = now - firstPts;
			this.nextPlayTime = now;
			this.lastCalibrationTime = now;
			this.isPrebuffering = false;

			// Fade-in: start from silence and ramp to target volume
			if (this.gainNode && this.config.fadeInDuration > 0) {
				this.gainNode.gain.setValueAtTime(0, now);
				this.gainNode.gain.linearRampToValueAtTime(this.config.volume, now + this.config.fadeInDuration);
			}

			console.log(
				'[AudioStreamClient] Prebuffer complete:',
				'accumulated=', this.prebufferAccum.toFixed(3), 's',
				'packets=', this.prebufferQueue.length,
			);

			// Schedule all queued buffers
			for (const queued of this.prebufferQueue) {
				this.scheduleImmediate(queued.audioBuffer);
			}
			this.prebufferQueue = [];
			this.prebufferAccum = 0;
			return;
		}

		const now = this.audioCtx.currentTime;

		// Initialize PTS offset on first frame (fallback, should not hit after prebuffer)
		if (this.ptsOffset === null) {
			this.ptsOffset = now - ptsSeconds;
			this.nextPlayTime = now;
			this.lastCalibrationTime = now;
		}

		// --- Drift calibration (every CALIBRATION_INTERVAL seconds) ---
		if (now - this.lastCalibrationTime >= AudioStreamClient.CALIBRATION_INTERVAL) {
			this.lastCalibrationTime = now;
			const expectedPts = now - this.ptsOffset;
			const drift = ptsSeconds - expectedPts;
			const absDrift = Math.abs(drift);
			this.lastDriftMs = drift * 1000;

			if (absDrift >= AudioStreamClient.DRIFT_MIN && absDrift <= AudioStreamClient.DRIFT_MAX) {
				const correction = drift * AudioStreamClient.DRIFT_CORRECTION;
				this.ptsOffset -= correction;
				console.log(
					'[AudioStreamClient] Drift calibration:',
					'drift=', (drift * 1000).toFixed(2), 'ms',
					'correction=', (correction * 1000).toFixed(2), 'ms',
				);
			}
		}

		this.scheduleImmediate(audioBuffer);
	}

	/** Schedule a single AudioBuffer for immediate/sequential playback */
	private scheduleImmediate(audioBuffer: AudioBuffer): void {
		if (!this.audioCtx || !this.gainNode) return;

		const source = this.audioCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(this.gainNode);

		const now = this.audioCtx.currentTime;

		// If we're behind, catch up
		if (this.nextPlayTime < now) {
			this.nextPlayTime = now;
		}

		source.start(this.nextPlayTime);
		this.nextPlayTime += audioBuffer.duration;
	}

	// =========================================================================
	// Master Clock
	// =========================================================================

	/**
	 * Get current playback time in media PTS seconds.
	 * Used as master clock for A/V sync.
	 *
	 * Prefers `getOutputTimestamp().contextTime` which compensates for
	 * audio output latency (sound-card buffer), falling back to
	 * `audioCtx.currentTime` if unavailable.
	 */
	getCurrentTime(): number {
		if (!this.audioCtx || this.ptsOffset === null) return 0;

		let ctxTime = this.audioCtx.currentTime;
		try {
			const ts = this.audioCtx.getOutputTimestamp();
			if (ts.contextTime !== undefined && ts.contextTime > 0) {
				ctxTime = ts.contextTime;
			}
		} catch {
			// getOutputTimestamp not supported — use currentTime
		}

		return ctxTime - this.ptsOffset;
	}

	/**
	 * Whether the audio clock is ready (prebuffer done and offset established)
	 */
	get isClockReady(): boolean {
		return this.ptsOffset !== null && !this.isPrebuffering;
	}

	// =========================================================================
	// Volume & Fading
	// =========================================================================

	setVolume(volume: number): void {
		this.config.volume = Math.max(0, Math.min(1, volume));
		if (this.gainNode && this.audioCtx && !this.isPaused) {
			this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
			this.gainNode.gain.setValueAtTime(this.config.volume, this.audioCtx.currentTime);
		}
	}

	/**
	 * Immediately mute audio output and stop scheduling new buffers.
	 * Already-scheduled AudioBufferSourceNodes are silenced via gain = 0.
	 * New PCM packets arriving from WebSocket are discarded while paused.
	 */
	pause(): void {
		if (this.isPaused) return;
		this.isPaused = true;

		if (this.gainNode && this.audioCtx) {
			this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
			this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
		}
	}

	/**
	 * Resume audio output after pause.
	 * Restores gain to configured volume. Playback continues from where
	 * the pre-scheduled buffers left off (seamless if pause was short).
	 */
	resume(): void {
		if (!this.isPaused) return;
		this.isPaused = false;

		if (this.gainNode && this.audioCtx) {
			this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
			this.gainNode.gain.setValueAtTime(this.config.volume, this.audioCtx.currentTime);
		}
	}

	/**
	 * Fade out audio over the configured duration.
	 * Returns a Promise that resolves when the fade completes.
	 */
	fadeOut(duration?: number): Promise<void> {
		const dur = duration ?? this.config.fadeOutDuration;
		if (!this.gainNode || !this.audioCtx || dur <= 0) {
			return Promise.resolve();
		}

		const now = this.audioCtx.currentTime;
		this.gainNode.gain.cancelScheduledValues(now);
		this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
		this.gainNode.gain.linearRampToValueAtTime(0, now + dur);

		return new Promise((resolve) => setTimeout(resolve, dur * 1000));
	}

	// =========================================================================
	// Stats
	// =========================================================================

	getStats(): AudioStreamStats {
		return {
			packetsReceived: this.packetCount,
			isClockReady: this.isClockReady,
			currentPtsSeconds: this.getCurrentTime(),
			prebuffering: this.isPrebuffering,
			driftMs: this.lastDriftMs,
		};
	}

	// =========================================================================
	// Seek Reset
	// =========================================================================

	/**
	 * Reset audio clock state after a seek operation.
	 *
	 * Disconnects the old GainNode (silencing all previously scheduled
	 * AudioBufferSourceNodes that are still playing from the pre-seek
	 * position) and creates a fresh GainNode for post-seek audio.
	 * Clears the PTS offset so the next packet re-establishes the clock
	 * (and triggers a fresh fade-in via prebuffer).
	 *
	 * Increments seekGeneration so that stale PCM packets still in-flight
	 * from the pre-seek position are discarded by handlePacket().
	 */
	resetClock(): void {
		// Invalidate in-flight packets from pre-seek position
		this.seekGeneration++;

		if (this.audioCtx) {
			// Disconnect old gain node — all previously scheduled sources
			// still reference it but now play into a disconnected graph (silent).
			if (this.gainNode) {
				this.gainNode.disconnect();
			}

			// Create a fresh gain node for post-seek audio
			this.gainNode = this.audioCtx.createGain();
			this.gainNode.gain.value = 0; // start muted; fade-in happens on prebuffer complete
			this.gainNode.connect(this.audioCtx.destination);
		}

		this.ptsOffset = null;
		this.nextPlayTime = 0;
		this.lastCalibrationTime = 0;
		this.isPaused = false;

		// Reset prebuffer state — next prebuffer completion will fade-in
		this.isPrebuffering = true;
		this.prebufferQueue = [];
		this.prebufferAccum = 0;
		this.lastDriftMs = 0;
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
		if (!this.audioCtx || !this.gainNode) return;

		// Discard packets while paused — no point scheduling audio nobody hears
		if (this.isPaused) return;

		const packet = parsePcmPacket(data);
		if (!packet) return;

		// Capture seek generation before any async-ish work
		const gen = this.seekGeneration;

		this.packetCount++;
		if (this.packetCount <= 3 || this.packetCount % 200 === 0) {
			console.log(
				'[AudioStreamClient] Packet #' + this.packetCount,
				'pts=', packet.pts,
				'dur=', packet.duration,
				'sr=', packet.sampleRate,
				'ch=', packet.channels,
				'pcmBytes=', packet.pcmData.byteLength,
			);
		}

		// Stale packet from pre-seek position — discard
		if (gen !== this.seekGeneration) return;

		this.sampleRate = packet.sampleRate;

		// Interpret payload as interleaved f32le samples
		const floats = new Float32Array(
			packet.pcmData.buffer,
			packet.pcmData.byteOffset,
			packet.pcmData.byteLength / 4,
		);
		const channels = packet.channels || 2;
		const samplesPerChannel = floats.length / channels;

		if (samplesPerChannel <= 0) return;

		// Create AudioBuffer and de-interleave into per-channel arrays
		const audioBuffer = this.audioCtx.createBuffer(channels, samplesPerChannel, packet.sampleRate);
		for (let ch = 0; ch < channels; ch++) {
			const channelData = audioBuffer.getChannelData(ch);
			for (let i = 0; i < samplesPerChannel; i++) {
				channelData[i] = floats[i * channels + ch];
			}
		}

		const ptsSeconds = packet.pts / 1_000_000;
		this.scheduleBuffer(audioBuffer, ptsSeconds);
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
