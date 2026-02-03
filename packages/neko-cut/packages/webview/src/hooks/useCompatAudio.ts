/**
 * useCompatAudio - Compat 模式音频播放 Hook
 *
 * 用于 compat 模式下接收 Extension 端流式传输的 PCM 音频数据并播放
 *
 * 架构（符合 docs/principle.md）：
 * ```
 * Extension: FFmpeg（解封+解码）→ 混音 → postMessage
 * Webview: 接收 PCM → Web Audio API 播放
 * ```
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { getVSCodeAPI } from '../utils/vscodeApi';

// =============================================================================
// Types
// =============================================================================

interface UseCompatAudioOptions {
	enabled?: boolean;
	sampleRate?: number;
	channels?: number;
}

interface UseCompatAudioResult {
	isInitialized: boolean;
	isPlaying: boolean;
	error: string | null;
	startAudioStream: (startTime: number, duration: number) => void;
	stopAudioStream: () => void;
	setVolume: (volume: number) => void;
	setMuted: (muted: boolean) => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;

// =============================================================================
// Hook Implementation
// =============================================================================

export function useCompatAudio(
	options: UseCompatAudioOptions = {}
): UseCompatAudioResult {
	const {
		enabled = true,
		sampleRate = DEFAULT_SAMPLE_RATE,
		channels = DEFAULT_CHANNELS,
	} = options;

	// State
	const [isInitialized, setIsInitialized] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Refs
	const audioContextRef = useRef<AudioContext | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const sessionIdRef = useRef<string>('');
	const pendingBuffersRef = useRef<Float32Array[]>([]);
	const isPlayingRef = useRef(false);
	const nextPlayTimeRef = useRef(0);

	// Initialize AudioContext
	useEffect(() => {
		if (!enabled) return;

		try {
			const audioContext = new AudioContext({ sampleRate });
			audioContextRef.current = audioContext;

			// Create gain node for volume control
			const gainNode = audioContext.createGain();
			gainNode.connect(audioContext.destination);
			gainNodeRef.current = gainNode;

			setIsInitialized(true);
			console.log('[useCompatAudio] AudioContext initialized');
		} catch (e) {
			console.error('[useCompatAudio] Failed to initialize AudioContext:', e);
			setError('Failed to initialize audio');
		}

		return () => {
			if (audioContextRef.current) {
				audioContextRef.current.close();
				audioContextRef.current = null;
			}
			gainNodeRef.current = null;
			setIsInitialized(false);
		};
	}, [enabled, sampleRate]);

	// Handle incoming audio data from Extension
	useEffect(() => {
		if (!enabled || !isInitialized) return;

		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			if (message?.type !== 'media:audioStream:data') return;

			const { sessionId, pcmData } = message.payload;

			// Ignore data from other sessions
			if (sessionId !== sessionIdRef.current) return;

			// Queue the buffer for playback
			if (pcmData && pcmData.length > 0) {
				// Convert to Float32Array if needed (postMessage may convert to regular array)
				const float32Data = pcmData instanceof Float32Array
					? pcmData
					: new Float32Array(pcmData);
				pendingBuffersRef.current.push(float32Data);
				schedulePlayback();
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [enabled, isInitialized]);

	// Schedule audio buffer playback
	const schedulePlayback = useCallback(() => {
		const audioContext = audioContextRef.current;
		const gainNode = gainNodeRef.current;
		if (!audioContext || !gainNode || !isPlayingRef.current) return;

		// Process all pending buffers
		while (pendingBuffersRef.current.length > 0) {
			const pcmData = pendingBuffersRef.current.shift();
			if (!pcmData) continue;

			// Create audio buffer
			const samplesPerChannel = pcmData.length / channels;
			const audioBuffer = audioContext.createBuffer(
				channels,
				samplesPerChannel,
				sampleRate
			);

			// Deinterleave stereo data
			for (let channel = 0; channel < channels; channel++) {
				const channelData = audioBuffer.getChannelData(channel);
				for (let i = 0; i < samplesPerChannel; i++) {
					channelData[i] = pcmData[i * channels + channel] ?? 0;
				}
			}

			// Create buffer source and schedule playback
			const source = audioContext.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(gainNode);

			// Calculate start time
			const currentTime = audioContext.currentTime;
			const startTime = Math.max(currentTime, nextPlayTimeRef.current);
			source.start(startTime);

			// Update next play time
			nextPlayTimeRef.current = startTime + audioBuffer.duration;
		}
	}, [channels, sampleRate]);

	// Start audio stream
	const startAudioStream = useCallback((startTime: number, duration: number) => {
		if (!isInitialized) {
			console.warn('[useCompatAudio] Cannot start: not initialized');
			return;
		}

		// Resume AudioContext if suspended
		if (audioContextRef.current?.state === 'suspended') {
			audioContextRef.current.resume();
		}

		// Generate session ID
		sessionIdRef.current = `audio-${Date.now()}`;
		isPlayingRef.current = true;
		nextPlayTimeRef.current = audioContextRef.current?.currentTime ?? 0;
		pendingBuffersRef.current = [];

		// Send start request to Extension
		const vscode = getVSCodeAPI();
		vscode?.postMessage({
			type: 'media:audioStream:start',
			requestId: `audio-start-${Date.now()}`,
			timestamp: Date.now(),
			payload: {
				sessionId: sessionIdRef.current,
				startTime,
				duration,
				sampleRate,
				channels,
			},
		});

		setIsPlaying(true);
		console.log(`[useCompatAudio] Audio stream started: ${sessionIdRef.current}`);
	}, [isInitialized, sampleRate, channels]);

	// Stop audio stream
	const stopAudioStream = useCallback(() => {
		if (!sessionIdRef.current) return;

		isPlayingRef.current = false;
		pendingBuffersRef.current = [];

		// Send stop request to Extension
		const vscode = getVSCodeAPI();
		vscode?.postMessage({
			type: 'media:audioStream:stop',
			requestId: `audio-stop-${Date.now()}`,
			timestamp: Date.now(),
			payload: {
				sessionId: sessionIdRef.current,
			},
		});

		sessionIdRef.current = '';
		setIsPlaying(false);
		console.log('[useCompatAudio] Audio stream stopped');
	}, []);

	// Set volume
	const setVolume = useCallback((volume: number) => {
		if (gainNodeRef.current) {
			gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume));
		}
	}, []);

	// Set muted
	const setMuted = useCallback((muted: boolean) => {
		if (gainNodeRef.current) {
			gainNodeRef.current.gain.value = muted ? 0 : 1;
		}
	}, []);

	return {
		isInitialized,
		isPlaying,
		error,
		startAudioStream,
		stopAudioStream,
		setVolume,
		setMuted,
	};
}

export default useCompatAudio;
