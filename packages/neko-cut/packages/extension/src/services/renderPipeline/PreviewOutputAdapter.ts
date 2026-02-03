/**
 * PreviewOutputAdapter - 预览输出适配器
 *
 * 职责：
 * - 实现 IPreviewOutputAdapter 接口
 * - 支持混合预览模式：Idle (JPEG) / Playback/Scrubbing (H.264)
 * - 通过 WebSocket 推送到 Webview
 *
 * 混合预览策略：
 * ```
 * Idle (静止)     → 高质量 JPEG 截图 → WebSocket /ws (JPEG)
 * Playback (播放) → H.264 硬件流     → WebSocket /ws/h264
 * Scrubbing (拖动) → H.264 硬件流    → WebSocket /ws/h264
 * ```
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责预览输出
 * - 依赖倒置 (D)：依赖 FrameServerService 和 RustMediaProcessorService 接口
 */

import type { FrameServerService } from '../FrameServerService';
import type { AudioServerService } from '../AudioServerService';
import type { RustMediaProcessorService } from '../RustMediaProcessorService';
import type {
	IPreviewOutputAdapter,
	NV12Texture,
	RenderedFrame,
	AudioBuffer,
	EncodedVideoPacket,
	PreviewEncoderConfig,
	PreviewMode,
	HybridPreviewConfig,
} from './IRenderPipeline';

// Video encoder session type from RustMediaProcessorService
type VideoEncoderSession = ReturnType<RustMediaProcessorService['createVideoEncoder']>;

// Default hybrid preview configuration
const DEFAULT_HYBRID_CONFIG: HybridPreviewConfig = {
	idle: {
		format: 'jpeg',
		quality: 90,
		debounceMs: 300,
	},
	streaming: {
		codec: 'h264',
		bitrate: 2_000_000,
		preset: 'ultrafast',
		keyframeInterval: 30,
	},
};

// =============================================================================
// PreviewOutputAdapter Implementation
// =============================================================================

/**
 * 预览输出适配器
 *
 * 支持混合预览模式：
 * - Idle: 高质量 JPEG 截图，像素级清晰
 * - Playback/Scrubbing: H.264 流，低带宽实时跟手
 */
export class PreviewOutputAdapter implements IPreviewOutputAdapter {
	readonly name = 'PreviewOutput';

	private _frameServer: FrameServerService | null;
	private _audioServer: AudioServerService | null;
	private _rustService: RustMediaProcessorService | null;
	private _encoder: VideoEncoderSession = null;
	private _encoderConfig: PreviewEncoderConfig | null = null;
	private _lastEncodedPacket: EncodedVideoPacket | null = null;
	private _frameIndex = 0;
	private _disposed = false;

	// Hybrid preview mode state
	private _previewMode: PreviewMode = 'idle';
	private _hybridConfig: HybridPreviewConfig = DEFAULT_HYBRID_CONFIG;

	constructor(
		frameServer: FrameServerService | null,
		audioServer: AudioServerService | null,
		rustService: RustMediaProcessorService | null
	) {
		this._frameServer = frameServer;
		this._audioServer = audioServer;
		this._rustService = rustService;
	}

	// =========================================================================
	// IPreviewOutputAdapter Implementation
	// =========================================================================

	/**
	 * 初始化预览编码器
	 */
	async initializeEncoder(config: PreviewEncoderConfig): Promise<void> {
		if (this._disposed || !this._rustService) {
			throw new Error('PreviewOutputAdapter is disposed or RustService not available');
		}

		// Close existing encoder
		if (this._encoder) {
			try {
				this._encoder.close();
			} catch {
				// Ignore close errors
			}
			this._encoder = null;
		}

		this._encoderConfig = config;

		// Create H.264 encoder using ffmpeg-next
		this._encoder = this._rustService.createPreviewEncoder(
			config.width,
			config.height,
			config.fps,
			config.bitrate
		);

		if (!this._encoder) {
			throw new Error('Failed to create preview encoder');
		}

		console.log(
			`[PreviewOutputAdapter] Encoder initialized: ${config.width}x${config.height}@${config.fps}fps, ` +
			`hw_active=${this._encoder.isHwActive()}`
		);
	}

	/**
	 * 获取编码后的视频包
	 */
	getEncodedPacket(): EncodedVideoPacket | null {
		return this._lastEncodedPacket;
	}

	/**
	 * 检查编码器是否可用
	 */
	isEncoderAvailable(): boolean {
		return this._encoder !== null;
	}

	/**
	 * 设置预览模式
	 */
	setPreviewMode(mode: PreviewMode): void {
		if (this._previewMode !== mode) {
			console.log(`[PreviewOutputAdapter] Mode changed: ${this._previewMode} → ${mode}`);
			this._previewMode = mode;
		}
	}

	/**
	 * 获取当前预览模式
	 */
	getPreviewMode(): PreviewMode {
		return this._previewMode;
	}

	/**
	 * 设置混合预览配置
	 */
	setHybridConfig(config: HybridPreviewConfig): void {
		this._hybridConfig = { ...DEFAULT_HYBRID_CONFIG, ...config };
	}

	/**
	 * 输出静态帧（Idle 模式）
	 * 使用 H264 编码器输出单帧（作为关键帧）
	 */
	async outputStaticFrame(frame: RenderedFrame): Promise<void> {
		if (this._disposed || !this._frameServer) {
			return;
		}

		// Use H264 encoder for static frame (as keyframe)
		if (this._encoder && this._rustService) {
			try {
				const pts = Math.round(frame.timestamp * 1_000_000);
				const packets = this._encoder.encodeFrame(
					{
						data: frame.data,
						width: frame.width,
						height: frame.height,
						format: 'rgba',
						timestamp: frame.timestamp,
						isKeyframe: true, // Force keyframe for static frame
					},
					pts
				);

				for (const packet of packets) {
					if (this._frameServer.pushH264Packet) {
						this._frameServer.pushH264Packet(
							packet.data,
							packet.pts,
							packet.dts,
							packet.isKeyframe
						);
					}
				}
			} catch (error) {
				console.error('[PreviewOutputAdapter] Failed to output static frame:', error);
			}
		}
	}

	/**
	 * 输出视频帧（NV12 格式）
	 *
	 * 所有模式都使用 H.264 流（NV12 直接编码，零拷贝）
	 */
	async outputVideoNV12(texture: NV12Texture): Promise<void> {
		if (this._disposed || !this._frameServer || !this._encoder) {
			return;
		}

		try {
			// Combine Y and UV planes into single NV12 buffer
			const nv12Buffer = Buffer.concat([texture.yPlane, texture.uvPlane]);

			// Encode NV12 frame directly to H264 using ffmpeg-next
			const pts = Math.round(texture.timestamp * 1_000_000); // Convert to microseconds
			const packets = this._encoder.encodeFrame(
				{
					data: nv12Buffer,
					width: texture.width,
					height: texture.height,
					format: 'nv12',
					timestamp: texture.timestamp,
					isKeyframe: this._previewMode === 'idle', // Force keyframe for idle mode
				},
				pts
			);

			// Send encoded packets via WebSocket
			for (const packet of packets) {
				this._lastEncodedPacket = {
					data: packet.data,
					pts: packet.pts,
					dts: packet.dts,
					isKeyframe: packet.isKeyframe,
					frameIndex: this._frameIndex++,
				};

				// Push H.264 packet to WebSocket
				if (this._frameServer.pushH264Packet) {
					this._frameServer.pushH264Packet(
						packet.data,
						packet.pts,
						packet.dts,
						packet.isKeyframe
					);
				}
			}
		} catch (error) {
			console.error('[PreviewOutputAdapter] Failed to encode NV12 frame:', error);
		}
	}

	/**
	 * 输出视频帧（RGBA 格式）
	 *
	 * 所有模式都使用 H.264 流
	 */
	async outputVideo(frame: RenderedFrame): Promise<void> {
		if (this._disposed || !this._frameServer) {
			return;
		}

		// All modes use H.264 stream
		if (this._encoder) {
			try {
				// Encode RGBA frame directly (encoder will convert to NV12 internally)
				const pts = Math.round(frame.timestamp * 1_000_000);
				const packets = this._encoder.encodeFrame(
					{
						data: frame.data,
						width: frame.width,
						height: frame.height,
						format: 'rgba',
						timestamp: frame.timestamp,
						isKeyframe: this._previewMode === 'idle', // Force keyframe for idle mode
					},
					pts
				);

				// Send encoded packets via WebSocket
				for (const packet of packets) {
					this._lastEncodedPacket = {
						data: packet.data,
						pts: packet.pts,
						dts: packet.dts,
						isKeyframe: packet.isKeyframe,
						frameIndex: this._frameIndex++,
					};

					// Push H.264 packet to WebSocket
					if (this._frameServer.pushH264Packet) {
						this._frameServer.pushH264Packet(
							packet.data,
							packet.pts,
							packet.dts,
							packet.isKeyframe
						);
					}
				}
			} catch (error) {
				console.error('[PreviewOutputAdapter] H.264 encoding failed:', error);
			}
		}
	}

	/**
	 * 输出音频数据
	 */
	async outputAudio(buffer: AudioBuffer): Promise<void> {
		if (this._disposed || !this._audioServer) {
			return;
		}

		try {
			const float32Data = new Float32Array(
				buffer.data.buffer,
				buffer.data.byteOffset,
				buffer.data.byteLength / 4
			);
			this._audioServer.pushAudioData(float32Data, buffer.startTime);
		} catch (error) {
			console.error('[PreviewOutputAdapter] Failed to output audio:', error);
		}
	}

	/**
	 * 完成输出
	 */
	async finalize(): Promise<void> {
		// Flush encoder
		if (this._encoder) {
			try {
				const packets = this._encoder.flush();
				for (const packet of packets) {
					if (this._frameServer?.pushH264Packet) {
						this._frameServer.pushH264Packet(
							packet.data,
							packet.pts,
							packet.dts,
							packet.isKeyframe
						);
					}
				}
			} catch (error) {
				console.warn('[PreviewOutputAdapter] Encoder flush failed:', error);
			}
		}
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;

		// Close encoder
		if (this._encoder) {
			try {
				this._encoder.close();
			} catch {
				// Ignore close errors
			}
			this._encoder = null;
		}

		// Don't dispose external services
		this._frameServer = null;
		this._audioServer = null;
		this._rustService = null;
		this._lastEncodedPacket = null;
	}

	// =========================================================================
	// Public Methods
	// =========================================================================

	/**
	 * 检查是否可用
	 */
	isAvailable(): boolean {
		return !this._disposed && this._frameServer !== null && this._rustService !== null;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * 创建预览输出适配器
 */
export function createPreviewOutputAdapter(
	frameServer: FrameServerService | null,
	audioServer: AudioServerService | null,
	rustService: RustMediaProcessorService | null
): PreviewOutputAdapter {
	return new PreviewOutputAdapter(frameServer, audioServer, rustService);
}
