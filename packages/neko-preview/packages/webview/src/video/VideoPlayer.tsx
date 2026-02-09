/**
 * VideoPlayer - Main video preview component
 *
 * Connects to neko-engine's H.264 stream via WebSocket,
 * decodes with WebCodecs, and renders to Canvas.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { H264StreamClient } from '../shared/H264StreamClient';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { VideoControls } from './VideoControls';
import type { MediaInfo, PreviewInitMessage } from '../shared/types';

export function VideoPlayer() {
	const { postMessage } = useVscodeReady();

	// State
	const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [isConnected, setIsConnected] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [speed, setSpeed] = useState(1.0);
	const [volume, setVolume] = useState(1.0);
	const [posterUrl, setPosterUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Refs
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const clientRef = useRef<H264StreamClient | null>(null);
	const playStartTimeRef = useRef<number>(0);
	const playWallTimeRef = useRef<number>(0);
	const animFrameRef = useRef<number>(0);

	// =========================================================================
	// Frame rendering callback
	// =========================================================================

	const onFrame = useCallback((frame: VideoFrame) => {
		const canvas = canvasRef.current;
		if (!canvas) {
			frame.close();
			return;
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			frame.close();
			return;
		}

		// Resize canvas to match frame dimensions
		if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
			canvas.width = frame.displayWidth;
			canvas.height = frame.displayHeight;
		}

		ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
		frame.close();
	}, []);

	// =========================================================================
	// Time tracking during playback
	// =========================================================================

	const updatePlaybackTime = useCallback(() => {
		if (!isPlaying || !mediaInfo) return;

		const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
		const newTime = playStartTimeRef.current + elapsed * speed;

		if (newTime >= mediaInfo.duration) {
			// Reached end
			setCurrentTime(mediaInfo.duration);
			setIsPlaying(false);
			postMessage({ type: 'preview:stop' });
			return;
		}

		setCurrentTime(newTime);
		animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
	}, [isPlaying, mediaInfo, speed, postMessage]);

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
				const { mediaInfo: info, h264Url } = (msg as PreviewInitMessage).payload;
				setMediaInfo(info);
				setIsLoading(false);

				// Connect H264 stream client
				if (h264Url) {
					const client = new H264StreamClient({
						websocketUrl: h264Url,
						width: info.width || 1920,
						height: info.height || 1080,
						onFrame,
						onConnectionChange: setIsConnected,
						onError: (err) => {
							console.error('[VideoPlayer] Stream error:', err);
							setError(err.message);
						},
					});
					clientRef.current = client;
					client.connect();
				}

				// Request first frame as poster
				postMessage({ type: 'preview:captureFrame', time: 0 });
				break;
			}

			case 'preview:frameData': {
				const { imageDataUrl } = msg.payload;
				setPosterUrl(imageDataUrl);
				break;
			}

			default:
				break;
		}
	});

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			clientRef.current?.dispose();
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

		postMessage({ type: 'preview:play', startTime, speed });
	}, [mediaInfo, currentTime, speed, postMessage]);

	const handlePause = useCallback(() => {
		setIsPlaying(false);
		postMessage({ type: 'preview:pause' });
	}, [postMessage]);

	const handleTogglePlay = useCallback(() => {
		if (isPlaying) {
			handlePause();
		} else {
			handlePlay();
		}
	}, [isPlaying, handlePlay, handlePause]);

	const handleSeek = useCallback((time: number) => {
		setCurrentTime(time);
		if (isPlaying) {
			playStartTimeRef.current = time;
			playWallTimeRef.current = performance.now();
		}
		postMessage({ type: 'preview:seek', time });
	}, [isPlaying, postMessage]);

	const handleSpeedChange = useCallback((newSpeed: number) => {
		setSpeed(newSpeed);
		if (isPlaying) {
			playStartTimeRef.current = currentTime;
			playWallTimeRef.current = performance.now();
		}
		postMessage({ type: 'preview:speed', speed: newSpeed });
	}, [isPlaying, currentTime, postMessage]);

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
				<span>Loading video...</span>
			</div>
		);
	}

	if (error) {
		return <div className="error">⚠️ {error}</div>;
	}

	if (!mediaInfo) {
		return <div className="error">⚠️ No media info available</div>;
	}

	return (
		<div className="video-player">
			<div className="video-player__canvas-container">
				{/* Canvas for H.264 decoded frames */}
				<canvas
					ref={canvasRef}
					className="video-player__canvas"
					style={{ display: isPlaying || !posterUrl ? 'block' : 'none' }}
				/>

				{/* Poster image when paused */}
				{!isPlaying && posterUrl && (
					<img
						src={posterUrl}
						className="video-player__poster"
						alt="Video preview"
					/>
				)}

				{/* Play overlay when paused */}
				{!isPlaying && (
					<div className="video-player__overlay" onClick={handleTogglePlay}>
						<div className="video-player__play-icon">
							<svg viewBox="0 0 24 24">
								<path d="M8 5v14l11-7z" />
							</svg>
						</div>
					</div>
				)}
			</div>

			<VideoControls
				isPlaying={isPlaying}
				currentTime={currentTime}
				duration={mediaInfo.duration}
				speed={speed}
				volume={volume}
				isConnected={isConnected}
				onTogglePlay={handleTogglePlay}
				onSeek={handleSeek}
				onSpeedChange={handleSpeedChange}
				onVolumeChange={handleVolumeChange}
			/>
		</div>
	);
}
