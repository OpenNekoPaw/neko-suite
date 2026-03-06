/**
 * EngineClient — HTTP/WS client for neko-engine Frame Server
 *
 * Environment-agnostic: works in both Extension Host (Node.js 18+)
 * and Webview (browser).  Uses only fetch() + WebSocket — zero
 * vscode dependency.  Port is injected via constructor.
 *
 * Usage (Extension Host):
 *   const { port } = await vscode.commands.executeCommand('neko.engine.ensureFrameServer');
 *   const client = new EngineClient(port);
 *
 * Usage (Webview — port received via postMessage):
 *   const client = new EngineClient(port);
 *   const info = await client.probe('videos', '/path/to/file.mp4');
 */

import type {
	ActionRequest,
	ActionResponse,
	RawProbeData,
	RawWaveformData,
	ProbeResult,
	WaveformResult,
	StreamHandle,
	DiffResult,
	Resolution,
	LoudnessAnalysis,
	SilenceAnalysis,
	EffectPresetInfo,
	EffectApplyResult,
	ShaderParamDef,
} from './engine/types';
import { transformDiffResponse } from './engine/responseTransform';

export interface EngineClientConfig {
	/** Request timeout in milliseconds (default: 120_000 for long diff operations) */
	timeout?: number;
}

export class EngineClient {
	readonly port: number;
	private readonly timeout: number;

	constructor(port: number, config?: EngineClientConfig) {
		this.port = port;
		this.timeout = config?.timeout ?? 120_000;
	}

	// =========================================================================
	// URL helpers
	// =========================================================================

	get baseUrl(): string {
		return `http://127.0.0.1:${this.port}`;
	}

	get wsBaseUrl(): string {
		return `ws://127.0.0.1:${this.port}/v1/streams`;
	}

	getStreamWsUrl(streamId: string): string {
		return `${this.wsBaseUrl}/${streamId}`;
	}

	// =========================================================================
	// Low-level dispatch
	// =========================================================================

	/**
	 * Generic dispatch — POST /v1/dispatch
	 * All convenience methods delegate here.
	 */
	async dispatch(req: ActionRequest): Promise<ActionResponse> {
		const body = JSON.stringify({
			group: req.group,
			action: req.action,
			id: req.id ?? '',
			source: req.source ?? undefined,
			sessionId: req.sessionId ?? undefined,
			streamId: req.streamId ?? undefined,
			options: req.options ?? {},
			body: req.body ?? null,
		});

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeout);

		try {
			const res = await fetch(`${this.baseUrl}/v1/dispatch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
				signal: controller.signal,
			});

			if (!res.ok) {
				throw new Error(`Engine HTTP ${res.status}: ${res.statusText}`);
			}

			return (await res.json()) as ActionResponse;
		} finally {
			clearTimeout(timer);
		}
	}

	// =========================================================================
	// Convenience methods
	// =========================================================================

	/**
	 * Probe media metadata.
	 * Dispatches `videos:probe` or `audios:probe`.
	 * Transforms the Rust nested response (videoStreams/audioStreams) into flat ProbeResult.
	 */
	async probe(group: 'videos' | 'audios', source: string): Promise<ProbeResult> {
		const resp = await this.dispatch({
			group,
			action: 'probe',
			options: { source },
		});
		this.assertOk(resp, `${group}:probe`);

		const raw = resp.data as RawProbeData;
		const video = raw.videoStreams?.[0];
		const audio = raw.audioStreams?.[0];
		return {
			duration: raw.duration ?? 0,
			width: video?.width ?? 0,
			height: video?.height ?? 0,
			fps: video?.fps ?? 0,
			codec: video?.codec ?? '',
			format: raw.format ?? '',
			bitrate: video?.bitrate,
			hasAudio: (raw.audioStreams?.length ?? 0) > 0,
			audioCodec: audio?.codec,
			audioSampleRate: audio?.sampleRate,
			audioChannels: audio?.channels,
			audioBitrate: audio?.bitrate,
		};
	}

	/**
	 * Generate waveform peaks for an audio file.
	 * Dispatches `audios:waveform`.
	 * Unwraps nested Rust response and downmixes multi-channel peaks to mono.
	 */
	async waveform(
		source: string,
		opts?: { peaksPerSecond?: number },
	): Promise<WaveformResult> {
		const resp = await this.dispatch({
			group: 'audios',
			action: 'waveform',
			options: { source, ...opts },
		});
		this.assertOk(resp, 'audios:waveform');

		// Rust response: { resourceId, waveform: { sampleRate, channels, peaksPerSecond, duration, peaks: number[][] } }
		const data = resp.data as Record<string, unknown>;
		const wf = data['waveform'] as RawWaveformData | undefined;
		if (!wf) {
			throw new Error('audios:waveform returned no waveform data');
		}

		return {
			peaks: downmixPeaks(wf.peaks),
			sampleRate: wf.sampleRate,
			channels: wf.channels,
			duration: wf.duration,
			peaksPerSecond: wf.peaksPerSecond,
		};
	}

	/**
	 * Diff two media files.
	 * Dispatches `{group}:diff` and transforms the Rust tagged-enum response.
	 * Returns typed DiffResult with flattened content (imageDiff/audioDiff/videoDiff/timelineDiff).
	 * Pass a custom type parameter T for consumers using @neko/shared EngineDiffResult.
	 */
	async diff<T = DiffResult>(
		group: string,
		sourceA: string,
		sourceB: string,
		options?: Record<string, unknown>,
	): Promise<T | null> {
		const resp = await this.dispatch({
			group,
			action: 'diff',
			options: { sourceA, sourceB, ...options },
		});

		if (resp.status === 'error') {
			console.error(`[EngineClient] diff(${group}) failed:`, resp.error?.message);
			return null;
		}

		const data = resp.data as Record<string, unknown> | undefined;
		if (!data) return null;

		return transformDiffResponse(data) as unknown as T;
	}

	/**
	 * Extract a single frame from a video file.
	 * Dispatches `videos:capture`.
	 * Returns raw image data as ArrayBuffer, or null on failure.
	 */
	async extractFrame(
		source: string,
		time: number,
		opts?: { quality?: number; format?: string },
	): Promise<ArrayBuffer | null> {
		const resp = await this.dispatch({
			group: 'videos',
			action: 'capture',
			options: {
				source,
				time,
				quality: opts?.quality ?? 85,
				format: opts?.format ?? 'jpeg',
			},
		});

		if (resp.status === 'error') return null;

		// Engine returns base64-encoded image data
		const data = resp.data as { data?: string; base64?: string } | undefined;
		const b64 = data?.data ?? data?.base64;
		if (!b64 || typeof b64 !== 'string') return null;

		return base64ToArrayBuffer(b64);
	}

	// =========================================================================
	// Stream management
	// =========================================================================

	/**
	 * Create a media stream and return its WebSocket URL + metadata.
	 * Dispatches `{group}:stream`.
	 * For `timelines:stream`, also returns audioStreamId/audioWsUrl.
	 */
	async createStream(
		group: string,
		source: string,
		opts?: Record<string, unknown>,
	): Promise<StreamHandle> {
		const resp = await this.dispatch({
			group,
			action: 'stream',
			options: { source, ...opts },
		});
		this.assertOk(resp, `${group}:stream`);

		const data = resp.data as Record<string, unknown> | undefined;
		const streamId =
			(data?.['videoStreamId'] as string | undefined) ??
			(data?.['streamId'] as string | undefined) ??
			(data?.['stream_id'] as string | undefined);
		if (!streamId) {
			throw new Error(`${group}:stream returned no streamId`);
		}

		const audioStreamId = data?.['audioStreamId'] as string | undefined;
		const resolution = data?.['resolution'] as Resolution | undefined;
		return {
			streamId,
			wsUrl: this.getStreamWsUrl(streamId),
			sessionId: (data?.['sessionId'] as string | undefined) ?? undefined,
			resolution,
			fps: (data?.['fps'] as number | undefined) ?? undefined,
			audioStreamId: audioStreamId ?? undefined,
			audioWsUrl: audioStreamId ? this.getStreamWsUrl(audioStreamId) : undefined,
		};
	}

	/**
	 * Control an active stream (resume / pause / seek / stop / speed / quality / update / etc.).
	 */
	async controlStream(
		group: string,
		streamId: string,
		action: string,
		opts?: Record<string, unknown>,
	): Promise<ActionResponse> {
		const resp = await this.dispatch({
			group,
			action,
			options: { streamId, ...opts },
		});
		// stop/pause may return 'ok' or silently succeed
		if (resp.status === 'error') {
			console.warn(`[EngineClient] controlStream(${action}) warning:`, resp.error?.message);
		}
		return resp;
	}

	// =========================================================================
	// Loudness analysis
	// =========================================================================

	/**
	 * Analyze audio loudness per ITU-R BS.1770-4.
	 * Dispatches `audios:analyze_loudness`.
	 * Returns integrated LUFS, true peak, loudness range, and recommended gain.
	 */
	async analyzeLoudness(
		source: string,
		targetLufs: number = -14,
	): Promise<LoudnessAnalysis> {
		const resp = await this.dispatch({
			group: 'audios',
			action: 'analyze_loudness',
			options: { source, targetLufs },
		});
		this.assertOk(resp, 'audios:analyze_loudness');
		return resp.data as LoudnessAnalysis;
	}

	// =========================================================================
	// Silence detection
	// =========================================================================

	/**
	 * Detect silence regions in an audio file.
	 * Dispatches `audios:detect_silence`.
	 * Returns regions where RMS is below the threshold for at least minDuration.
	 */
	async detectSilence(
		source: string,
		thresholdDbfs: number = -40,
		minDuration: number = 0.5,
	): Promise<SilenceAnalysis> {
		const resp = await this.dispatch({
			group: 'audios',
			action: 'detect_silence',
			options: { source, thresholdDbfs, minDuration },
		});
		this.assertOk(resp, 'audios:detect_silence');
		return resp.data as SilenceAnalysis;
	}

	// =========================================================================
	// Effects / Shader API
	// =========================================================================

	/**
	 * List all available GPU shader presets (built-in + custom registered).
	 * Dispatches `effects:list`.
	 */
	async listEffects(): Promise<EffectPresetInfo[]> {
		const resp = await this.dispatch({
			group: 'effects',
			action: 'list',
			options: {},
		});
		this.assertOk(resp, 'effects:list');
		return (resp.data as EffectPresetInfo[] | undefined) ?? [];
	}

	/**
	 * Get metadata for a specific shader preset.
	 * Dispatches `effects:info`.
	 */
	async getEffectInfo(shaderId: string): Promise<EffectPresetInfo> {
		const resp = await this.dispatch({
			group: 'effects',
			action: 'info',
			options: { shaderId },
		});
		this.assertOk(resp, 'effects:info');
		return resp.data as EffectPresetInfo;
	}

	/**
	 * Apply a shader effect to a raw RGBA frame (base64-encoded).
	 * Dispatches `effects:apply`.
	 */
	async applyEffect(
		data: string,
		width: number,
		height: number,
		shaderId: string,
		params?: Record<string, unknown>,
	): Promise<EffectApplyResult> {
		const resp = await this.dispatch({
			group: 'effects',
			action: 'apply',
			options: { data, width, height, shaderId, params: params ?? {} },
		});
		this.assertOk(resp, 'effects:apply');
		return resp.data as EffectApplyResult;
	}

	/**
	 * Register a custom WGSL compute shader at runtime.
	 * Dispatches `effects:register`.
	 * The shader must have entry point `main` and use 16x16 workgroups.
	 */
	async registerShader(
		id: string,
		code: string,
		params?: ShaderParamDef[],
	): Promise<void> {
		const resp = await this.dispatch({
			group: 'effects',
			action: 'register',
			options: { id, code, params: params ?? [] },
		});
		this.assertOk(resp, 'effects:register');
	}

	// =========================================================================
	// Health
	// =========================================================================

	/**
	 * Check if the Frame Server is reachable.
	 */
	async health(): Promise<boolean> {
		try {
			const res = await fetch(`${this.baseUrl}/health`, {
				signal: AbortSignal.timeout(3000),
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	// =========================================================================
	// Internals
	// =========================================================================

	private assertOk(resp: ActionResponse, label: string): void {
		if (resp.status === 'error') {
			const msg = resp.error?.message ?? `${label} failed`;
			throw new Error(msg);
		}
	}
}

// =============================================================================
// Utility
// =============================================================================

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	// Browser path
	if (typeof atob === 'function') {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}
	// Node.js path
	const buf = Buffer.from(base64, 'base64');
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Downmix multi-channel peaks to mono by taking max absolute value across channels.
 */
function downmixPeaks(multiChannel: number[][]): number[] {
	if (multiChannel.length === 0) return [];
	if (multiChannel.length === 1) return multiChannel[0] ?? [];

	const len = multiChannel[0]?.length ?? 0;
	const mono = new Array<number>(len);
	for (let i = 0; i < len; i++) {
		let max = 0;
		for (const ch of multiChannel) {
			const v = Math.abs(ch[i] ?? 0);
			if (v > max) max = v;
		}
		mono[i] = max;
	}
	return mono;
}
