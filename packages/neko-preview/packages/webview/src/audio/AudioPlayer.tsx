/**
 * AudioPlayer - Main audio preview component
 *
 * Connects to neko-engine's PCM audio stream via WebSocket,
 * plays through Web Audio API (AudioStreamClient), and visualizes waveform.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioStreamClient } from '../shared/AudioStreamClient';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { WaveformCanvas } from './WaveformCanvas';
import { AudioControls } from './AudioControls';
import type {
	MediaInfo,
	PreviewInitMessage,
	PreviewWaveformMessage,
} from '../shared/types';

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
	const audioClientRef = useRef<AudioStreamClient | null>(null);
	const playStartTimeRef = useRef(0);
	const playWallTimeRef = useRef(0);
	const animFrameRef = useRef(0);

	// =========================================================================
	// Time tracking during playback
	// =========================================================================

	const updatePlaybackTime = useCallback(() => {
		if (!isPlaying || !mediaInfo) return;

		let newTime: number;
		const audioClient = audioClientRef.current;
		if (audioClient && audioClient.isClockReady) {
			newTime = audioClient.getCurrentTime();
		} else {
			const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
			newTime = playStartTimeRef.current + elapsed;
		}

		if (newTime >= mediaInfo.duration) {
			setCurrentTime(mediaInfo.duration);
			setIsPlaying(false);
			audioClientRef.current?.dispose();
			audioClientRef.current = null;
			postMessage({ type: 'preview:stop' });
			return;
		}

		setCurrentTime(newTime);
		animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
	}, [isPlaying, mediaInfo, postMessage]);

	useEffect(() => {
		if (isPlaying) {
			animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
		}
		return () => {
			if (animFrameRef.current) {
				cancelAnimationFrame(animFrameRef.current);
			}
		};
	}, [isPlaying, updatePlaybackTime]);

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

			case 'preview:streamReady': {
				const { audioStreamUrl } = msg.payload as {
					streamId: string;
					streamUrl: string;
					audioStreamId?: string;
					audioStreamUrl?: string;
				};

				// Dispose previous client
				audioClientRef.current?.dispose();

				const streamUrl = audioStreamUrl;
				if (streamUrl) {
					const audioClient = new AudioStreamClient({
						websocketUrl: streamUrl,
						volume,
						onConnectionChange: (connected) => {
							console.log('[AudioPlayer] Stream connected:', connected);
						},
						onError: (err) => {
							console.warn('[AudioPlayer] Stream error:', err);
						},
					});
					audioClientRef.current = audioClient;
					audioClient.connect();
				}
				break;
			}

			default:
				break;
		}
	});

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			audioClientRef.current?.dispose();
		};
	}, []);

	// =========================================================================
	// Playback controls
	// =========================================================================

	const handlePlay = useCallback(() => {
		if (!mediaInfo) return;

		const startTime = currentTime >= mediaInfo.duration ? 0 : currentTime;
		setCurrentTime(startTime);
		setIsPlaying(true);
		playStartTimeRef.current = startTime;
		playWallTimeRef.current = performance.now();

		postMessage({ type: 'preview:play', startTime });
	}, [mediaInfo, currentTime, postMessage]);

	const handlePause = useCallback(() => {
		setIsPlaying(false);
		postMessage({ type: 'preview:pause' });
	}, [postMessage]);

	const handleResume = useCallback(() => {
		setIsPlaying(true);
		playStartTimeRef.current = currentTime;
		playWallTimeRef.current = performance.now();
		postMessage({ type: 'preview:resume' });
	}, [currentTime, postMessage]);

	const handleTogglePlay = useCallback(() => {
		if (isPlaying) {
			handlePause();
		} else if (audioClientRef.current) {
			handleResume();
		} else {
			handlePlay();
		}
	}, [isPlaying, handlePlay, handlePause, handleResume]);

	const handleSeek = useCallback(
		(time: number) => {
			setCurrentTime(time);
			if (isPlaying) {
				playStartTimeRef.current = time;
				playWallTimeRef.current = performance.now();
			}
			// Reset audio clock so it re-syncs after seek
			audioClientRef.current?.resetClock();
			postMessage({ type: 'preview:seek', time });
		},
		[isPlaying, postMessage]
	);

	const handleVolumeChange = useCallback((newVolume: number) => {
		setVolume(newVolume);
		audioClientRef.current?.setVolume(newVolume);
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
