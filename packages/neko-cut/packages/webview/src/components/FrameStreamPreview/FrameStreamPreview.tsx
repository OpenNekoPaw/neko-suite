/**
 * FrameStreamPreview - 帧流预览测试组件
 *
 * 用于验证 Localhost Server 方案的可行性
 * 支持两种模式：
 * 1. MJPEG 模式：使用 <img> 标签直接显示
 * 2. WebSocket 模式：使用 FrameStreamReceiver 接收帧
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
	FrameStreamReceiver,
	createMjpegImageUrl,
	createWebSocketUrl,
} from '../../services/FrameStreamReceiver';

export interface FrameStreamPreviewProps {
	/** Server port from Extension */
	port: number;
	/** Stream mode */
	mode: 'mjpeg' | 'websocket';
	/** Preview width */
	width?: number;
	/** Preview height */
	height?: number;
	/** Show stats overlay */
	showStats?: boolean;
}

interface StreamStats {
	framesReceived: number;
	framesDropped: number;
	fps: number;
	latencyMs: number;
	isConnected: boolean;
}

/**
 * Frame stream preview component for testing localhost server approach
 */
export const FrameStreamPreview: React.FC<FrameStreamPreviewProps> = ({
	port,
	mode,
	width = 640,
	height = 360,
	showStats = true,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const receiverRef = useRef<FrameStreamReceiver | null>(null);
	const frameCountRef = useRef(0);
	const lastFpsUpdateRef = useRef(performance.now());

	const [stats, setStats] = useState<StreamStats>({
		framesReceived: 0,
		framesDropped: 0,
		fps: 0,
		latencyMs: 0,
		isConnected: false,
	});

	// Handle frame received (WebSocket mode)
	const handleFrame = useCallback((bitmap: ImageBitmap) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Draw frame to canvas
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		// Update FPS counter
		frameCountRef.current++;
		const now = performance.now();
		const elapsed = now - lastFpsUpdateRef.current;

		if (elapsed >= 1000) {
			const fps = (frameCountRef.current / elapsed) * 1000;
			frameCountRef.current = 0;
			lastFpsUpdateRef.current = now;

			// Update stats
			const receiverStats = receiverRef.current?.getStats();
			setStats({
				framesReceived: receiverStats?.framesReceived ?? 0,
				framesDropped: receiverStats?.framesDropped ?? 0,
				fps: Math.round(fps),
				latencyMs: Math.round(receiverStats?.latencyMs ?? 0),
				isConnected: receiverStats?.isConnected ?? false,
			});
		}
	}, []);

	// Setup WebSocket receiver
	useEffect(() => {
		if (mode !== 'websocket' || !port) return;

		const receiver = new FrameStreamReceiver({
			websocketUrl: createWebSocketUrl(port),
			maxBufferSize: 3,
			onFrame: handleFrame,
			onConnectionChange: (connected) => {
				setStats((prev) => ({ ...prev, isConnected: connected }));
			},
			onError: (error) => {
				console.error('[FrameStreamPreview] Error:', error);
			},
		});

		receiverRef.current = receiver;
		receiver.connect();

		return () => {
			receiver.disconnect();
			receiverRef.current = null;
		};
	}, [port, mode, handleFrame]);

	// MJPEG mode - just use img tag
	if (mode === 'mjpeg') {
		return (
			<div className="frame-stream-preview" style={{ position: 'relative', width, height }}>
				<img
					src={createMjpegImageUrl(port)}
					alt="MJPEG Stream"
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'contain',
						backgroundColor: '#000',
					}}
				/>
				{showStats && (
					<div
						style={{
							position: 'absolute',
							top: 8,
							left: 8,
							padding: '4px 8px',
							backgroundColor: 'rgba(0, 0, 0, 0.7)',
							color: '#fff',
							fontSize: 12,
							fontFamily: 'monospace',
							borderRadius: 4,
						}}
					>
						MJPEG Mode | Port: {port}
					</div>
				)}
			</div>
		);
	}

	// WebSocket mode - use canvas
	return (
		<div className="frame-stream-preview" style={{ position: 'relative', width, height }}>
			<canvas
				ref={canvasRef}
				width={width}
				height={height}
				style={{
					width: '100%',
					height: '100%',
					backgroundColor: '#000',
				}}
			/>
			{showStats && (
				<div
					style={{
						position: 'absolute',
						top: 8,
						left: 8,
						padding: '4px 8px',
						backgroundColor: 'rgba(0, 0, 0, 0.7)',
						color: '#fff',
						fontSize: 12,
						fontFamily: 'monospace',
						borderRadius: 4,
					}}
				>
					<div>WebSocket Mode | Port: {port}</div>
					<div>
						{stats.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
					</div>
					<div>FPS: {stats.fps} | Latency: {stats.latencyMs}ms</div>
					<div>
						Frames: {stats.framesReceived} | Dropped: {stats.framesDropped}
					</div>
				</div>
			)}
		</div>
	);
};

export default FrameStreamPreview;
