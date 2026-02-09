/**
 * AudioPlayer - Main audio preview component
 *
 * Requests PCM audio segments from neko-engine via postMessage,
 * plays them through Web Audio API, and visualizes waveform.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { WaveformCanvas } from './WaveformCanvas';
import { AudioControls } from './AudioControls';
import type {
	MediaInfo,
	PreviewInitMessage,
	PreviewWaveformMessage,
	PreviewAudioDataMessage,
} from '../shared/types';

/** Decode base64 PCM Float32 data to AudioBuffer */
function decodeAudioData(
	base64: string,
	sampleRate: number,
	channels: number,
	samples: number
): AudioBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	const float32 = new Float32Array(bytes.buffer);
	const audioBuffer = new AudioBuffer({
		length: samples,
		numberOfChannels: channels,
		sampleRate,
	});

	// Deinterleave channels
	for (let ch = 0; ch < channels; ch++) {
		const channelData = audioBuffer.getChannelData(ch);
		for (let i = 0; i < samples; i++) {
			channelData[i] = float32[i * channels + ch] ?? 0;
		}
	}

	return audioBuffer;
}

// Segment size for audio buffering (seconds)
const SEGMENT_DURATION = 30;

export function AudioPlayer() {
	const { postMessage } = useVscodeReady();

	// State
	const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
	const [waveformData, setWaveformData] = useState<{
		peaks: number[];
		duration: number;
	} | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [volume, setVolume] = useState(1.0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Refs
	const audioCtxRef = useRef<AudioContext | null>(null);
	const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
	const gainNodeRef = useRef<GainNode | null>(null);
	const playStartTimeRef = useRef(0);
	const playCtxTimeRef = useRef(0);
	const animFrameRef = useRef(0);
	const pendingRequestsRef = useRef<Map<string, (data: PreviewAudioDataMessage) => void>>(new Map());
	const requestIdCounterRef = useRef(0);

	// =========================================================================
	// Audio Context
	// =========================================================================

	const getAudioContext = useCallback(() => {
		if (!audioCtxRef.current) {
			audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
			gainNodeRef.current = audioCtxRef.current.createGain();
			gainNodeRef.current.connect(audioCtxRef.current.destination);
		}
		return audioCtxRef.current;
	}, []);

	// Update gain when volume changes
	useEffect(() => {
		if (gainNodeRef.current) {
			gainNodeRef.current.gain.value = volume;
		}
	}, [volume]);

	// Cleanup
	useEffect(() => {
		return () => {
			sourceNodeRef.current?.stop();
			audioCtxRef.current?.close();
		};
	}, []);

	// =========================================================================
	// Time tracking
	// =========================================================================

	const updateTime = useCallback(() => {
		if (!isPlaying || !mediaInfo) return;

		const ctx = audioCtxRef.current;
		if (!ctx) return;

		const elapsed = ctx.currentTime - playCtxTimeRef.current;
		const newTime = playStartTimeRef.current + elapsed;

		if (newTime >= mediaInfo.duration) {
			setCurrentTime(mediaInfo.duration);
			setIsPlaying(false);
			return;
		}

		setCurrentTime(newTime);
		animFrameRef.current = requestAnimationFrame(updateTime);
	}, [isPlaying, mediaInfo]);

	useEffect(() => {
		if (isPlaying) {
			animFrameRef.current = requestAnimationFrame(updateTime);
		}
		return () => {
			if (animFrameRef.current) {
				cancelAnimationFrame(animFrameRef.current);
			}
		};
	}, [isPlaying, updateTime]);

	// =========================================================================
	// Extension message handling
	// =========================================================================

	useExtensionMessage((msg) => {
		switch (msg.type) {
			case 'preview:init': {
				const { mediaInfo: info } = (msg as PreviewInitMessage).payload;
				setMediaInfo(info);
				setIsLoading(false);
				break;
			}

			case 'preview:waveform': {
				const waveform = (msg as PreviewWaveformMessage).payload;
				setWaveformData({
					peaks: waveform.peaks,
					duration: waveform.duration,
				});
				break;
			}

			case 'preview:audioData': {
				const audioMsg = msg as PreviewAudioDataMessage;
				const resolver = pendingRequestsRef.current.get(audioMsg.requestId);
				if (resolver) {
					resolver(audioMsg);
					pendingRequestsRef.current.delete(audioMsg.requestId);
				}
				break;
			}

			default:
				break;
		}
	});

	// =========================================================================
	// Audio segment request
	// =========================================================================

	const requestAudioSegment = useCallback(
		(startTime: number, duration: number): Promise<AudioBuffer | null> => {
			return new Promise((resolve) => {
				const requestId = `audio_${++requestIdCounterRef.current}`;

				pendingRequestsRef.current.set(requestId, (response) => {
					if (response.error || !response.payload) {
						console.error('[AudioPlayer] Decode error:', response.error);
						resolve(null);
						return;
					}

					try {
						const { buffer, sampleRate, channels, samples } = response.payload;
						const audioBuffer = decodeAudioData(buffer, sampleRate, channels, samples);
						resolve(audioBuffer);
					} catch (err) {
						console.error('[AudioPlayer] AudioBuffer creation failed:', err);
						resolve(null);
					}
				});

				postMessage({
					type: 'preview:decodeSegment',
					requestId,
					startTime,
					duration,
				});
			});
		},
		[postMessage]
	);

	// =========================================================================
	// Playback controls
	// =========================================================================

	const handlePlay = useCallback(async () => {
		if (!mediaInfo) return;

		const startTime = currentTime >= mediaInfo.duration ? 0 : currentTime;
		setIsPlaying(true);

		const ctx = getAudioContext();
		if (ctx.state === 'suspended') {
			await ctx.resume();
		}

		// Request audio segment
		const segmentStart = startTime;
		const segmentDuration = Math.min(SEGMENT_DURATION, mediaInfo.duration - segmentStart);

		const audioBuffer = await requestAudioSegment(segmentStart, segmentDuration);
		if (!audioBuffer) {
			setError('Failed to decode audio');
			setIsPlaying(false);
			return;
		}

		// Stop previous source
		try {
			sourceNodeRef.current?.stop();
		} catch {
			// Ignore
		}

		// Create and play new source
		const source = ctx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(gainNodeRef.current!);

		source.onended = () => {
			// Check if we need to load next segment
			const endTime = segmentStart + segmentDuration;
			if (endTime < mediaInfo.duration && isPlaying) {
				// TODO(P1): implement continuous segment loading for long files
				setIsPlaying(false);
				setCurrentTime(endTime);
			} else {
				setIsPlaying(false);
			}
		};

		playStartTimeRef.current = startTime;
		playCtxTimeRef.current = ctx.currentTime;
		source.start(0);
		sourceNodeRef.current = source;
		setCurrentTime(startTime);
	}, [mediaInfo, currentTime, getAudioContext, requestAudioSegment, isPlaying]);

	const handlePause = useCallback(() => {
		setIsPlaying(false);
		try {
			sourceNodeRef.current?.stop();
		} catch {
			// Ignore
		}
	}, []);

	const handleTogglePlay = useCallback(() => {
		if (isPlaying) {
			handlePause();
		} else {
			handlePlay();
		}
	}, [isPlaying, handlePlay, handlePause]);

	const handleSeek = useCallback(
		(time: number) => {
			setCurrentTime(time);
			if (isPlaying) {
				// Restart playback from new position
				try {
					sourceNodeRef.current?.stop();
				} catch {
					// Ignore
				}
				// Will trigger re-play from new position
				setIsPlaying(false);
				setTimeout(() => {
					handlePlay();
				}, 50);
			}
		},
		[isPlaying, handlePlay]
	);

	const handleVolumeChange = useCallback((newVolume: number) => {
		setVolume(newVolume);
	}, []);

	// =========================================================================
	// Render
	// =========================================================================

	if (isLoading) {
		return (
			<div className="loading">
				<div className="loading__spinner" />
				<span>Loading audio...</span>
			</div>
		);
	}

	if (error) {
		return <div className="error">⚠️ {error}</div>;
	}

	if (!mediaInfo) {
		return <div className="error">⚠️ No media info available</div>;
	}

	// Extract filename from path
	const fileName = mediaInfo.format || 'Audio File';

	return (
		<div className="audio-player">
			{/* File info header */}
			<div className="audio-player__info">
				<div className="audio-player__icon">
					<svg viewBox="0 0 24 24">
						<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
					</svg>
				</div>
				<div className="audio-player__meta">
					<div className="audio-player__filename">{fileName}</div>
					<div className="audio-player__details">
						{mediaInfo.audioCodec?.toUpperCase() ?? 'Unknown'} •{' '}
						{mediaInfo.audioSampleRate ? `${(mediaInfo.audioSampleRate / 1000).toFixed(1)} kHz` : ''} •{' '}
						{mediaInfo.audioChannels === 1 ? 'Mono' : mediaInfo.audioChannels === 2 ? 'Stereo' : `${mediaInfo.audioChannels}ch`}
						{mediaInfo.bitrate ? ` • ${Math.round(mediaInfo.bitrate / 1000)} kbps` : ''}
					</div>
				</div>
			</div>

			{/* Waveform visualization */}
			<div className="audio-player__waveform-container">
				<WaveformCanvas
					peaks={waveformData?.peaks ?? null}
					duration={mediaInfo.duration}
					currentTime={currentTime}
					onSeek={handleSeek}
				/>
			</div>

			{/* Controls */}
			<AudioControls
				isPlaying={isPlaying}
				currentTime={currentTime}
				duration={mediaInfo.duration}
				volume={volume}
				onTogglePlay={handleTogglePlay}
				onSeek={handleSeek}
				onVolumeChange={handleVolumeChange}
			/>
		</div>
	);
}
