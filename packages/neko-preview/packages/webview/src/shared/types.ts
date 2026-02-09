/**
 * Preview message protocol types
 *
 * Defines the postMessage contract between Extension and Webview.
 */

// =============================================================================
// Media Info (from Extension probe)
// =============================================================================

export interface MediaInfo {
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
}

// =============================================================================
// Extension → Webview Messages
// =============================================================================

export interface PreviewInitMessage {
	type: 'preview:init';
	payload: {
		filePath: string;
		mediaInfo: MediaInfo;
		/** Frame server port (video only) */
		port?: number | null;
		/** H.264 WebSocket URL (video only) */
		h264Url?: string | null;
	};
}

export interface PreviewFrameDataMessage {
	type: 'preview:frameData';
	payload: {
		imageDataUrl: string;
	};
}

export interface PreviewWaveformMessage {
	type: 'preview:waveform';
	payload: {
		peaks: number[];
		duration: number;
		sampleRate: number;
	};
}

export interface PreviewAudioDataMessage {
	type: 'preview:audioData';
	requestId: string;
	payload?: {
		buffer: string;
		sampleRate: number;
		channels: number;
		samples: number;
	};
	error?: string;
}

export type ExtensionMessage =
	| PreviewInitMessage
	| PreviewFrameDataMessage
	| PreviewWaveformMessage
	| PreviewAudioDataMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface ReadyMessage {
	type: 'ready';
}

export interface PlayMessage {
	type: 'preview:play';
	startTime?: number;
	speed?: number;
}

export interface PauseMessage {
	type: 'preview:pause';
}

export interface ResumeMessage {
	type: 'preview:resume';
}

export interface StopMessage {
	type: 'preview:stop';
}

export interface SeekMessage {
	type: 'preview:seek';
	time: number;
}

export interface SpeedMessage {
	type: 'preview:speed';
	speed: number;
}

export interface CaptureFrameMessage {
	type: 'preview:captureFrame';
	time: number;
}

export interface DecodeSegmentMessage {
	type: 'preview:decodeSegment';
	requestId: string;
	startTime: number;
	duration: number;
}

export type WebviewMessage =
	| ReadyMessage
	| PlayMessage
	| PauseMessage
	| ResumeMessage
	| StopMessage
	| SeekMessage
	| SpeedMessage
	| CaptureFrameMessage
	| DecodeSegmentMessage;
