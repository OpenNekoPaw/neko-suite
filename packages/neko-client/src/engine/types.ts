/**
 * Engine dispatch types — ActionRequest / ActionResponse
 *
 * Mirrors the Rust-side dispatch protocol used by neko-engine's
 * Frame Server (POST /v1/dispatch).  Environment-agnostic:
 * works in both Extension Host (Node.js 18+) and Webview (browser).
 */

// =============================================================================
// Request / Response
// =============================================================================

export interface ActionRequest {
	group: string;
	action: string;
	id?: string;
	options?: Record<string, unknown>;
	body?: unknown;
}

export interface ActionResponse {
	id: string;
	status: 'ok' | 'error' | 'pending' | 'progress';
	data?: unknown;
	error?: { code: string; message: string } | null;
}

// =============================================================================
// Raw Rust response types (before transformation)
// =============================================================================

/** Raw probe response from Rust `videos:probe` / `audios:probe` (neko-engine MediaInfo) */
export interface RawProbeData {
	duration: number;
	format: string;
	fileSize?: number;
	videoStreams?: Array<{
		index?: number;
		codec: string;
		width: number;
		height: number;
		fps: number;
		bitrate?: number;
		pixelFormat?: string;
		frameCount?: number;
	}>;
	audioStreams?: Array<{
		index?: number;
		codec: string;
		sampleRate: number;
		channels: number;
		bitrate?: number;
		channelLayout?: string;
	}>;
	subtitleStreams?: Array<{
		index?: number;
		codec: string;
		language?: string;
		title?: string;
	}>;
}

/** Raw waveform response from Rust `audios:waveform` */
export interface RawWaveformData {
	sampleRate: number;
	channels: number;
	peaksPerSecond: number;
	duration: number;
	/** Multi-channel peaks: peaks[channel][sampleIndex] */
	peaks: number[][];
}

// =============================================================================
// Convenience result types (after transformation)
// =============================================================================

/** Flattened probe result — primary video/audio stream extracted */
export interface ProbeResult {
	duration: number;
	width: number;
	height: number;
	fps: number;
	codec: string;
	format: string;
	bitrate?: number;
	hasAudio: boolean;
	audioCodec?: string;
	audioSampleRate?: number;
	audioChannels?: number;
	audioBitrate?: number;
}

/** Mono waveform result — multi-channel peaks downmixed */
export interface WaveformResult {
	peaks: number[];
	sampleRate: number;
	channels: number;
	duration: number;
	peaksPerSecond?: number;
}

export interface StreamHandle {
	streamId: string;
	wsUrl: string;
	/** For timelines:stream which returns both video and audio stream IDs */
	audioStreamId?: string;
	audioWsUrl?: string;
}
