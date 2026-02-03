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
 * 注意：音频由 neko-engine 直接处理，不经过此适配器
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责视频预览输出
 * - 依赖倒置 (D)：依赖 FrameServerService 和 RustMediaProcessorService 接口
 */

import type { FrameServerService } from '../FrameServerService';
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
		rustService: RustMediaProcessorService | null
	) {
		this._frameServer = frameServer;
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
		}

		// Create new encoder
		this._encoder = this._rustService.createVideoEncoder({
			width: config.width,
			height: config.height,
			fps: config.fps,
			bitrate: config.bitrate,
			codec: config.codec,
			preset: config.preset,
			keyframeInterval: config.keyframeInterval,
		});

		this._encoderConfig = config;
		this._frameIndex = 0;

		console.log(
			`[PreviewOutputAdapter] Encoder initialized: ${config.width}x${config.height} @ ${config.fps}fps, ` +
			`${config.codec}, ${config.bitrate / 1000}kbps`
		);
	}

	/**
	 * 设置预览模式
	 */
	setPreviewMode(mode: PreviewMode): void {
		if (this._previewMode === mode) {
			return;
		}

		const prevMode = this._previewMode;
		this._previewMode = mode;

		console.log(`[PreviewOutputAdapter] Preview mode changed: ${prevMode} → ${mode}`);

		// Mode transition logic
		if (mode === 'idle') {
			// Transitioning to idle: flush encoder, prepare for JPEG
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
					console.warn('[PreviewOutputAdapter] Encoder flush on mode change failed:', error);
				}
			}
		}
	}

	/**
	 * 获取当前预览模式
	 */
	getPreviewMode(): PreviewMode {
		return this._previewMode;
	}

	/**
	 * 配置混合预览参数
	 */
	setHybridConfig(config: Partial<HybridPreviewConfig>): void {
		this._hybridConfig = {
			...this._hybridConfig,
			...config,
			idle: { ...this._hybridConfig.idle, ...config.idle },
			streaming: { ...this._hybridConfig.streaming, ...config.streaming },
		};
	}

	/**
	 * 输出 NV12 纹理（GPU 路径）
	 */
	async outputNV12Texture(texture: NV12Texture): Promise<void> {
		if (this._disposed || !this._encoder || !this._frameServer) {
			return;
		}

		// Encode NV12 to H.264
		try {
			const packet = this._encoder.encodeNV12(
				texture.yPlane,
				texture.uvPlane,
				texture.width,
				texture.height,
				texture.yStride,
				texture.uvStride,
				this._frameIndex++
			);

			if (packet && this._frameServer.pushH264Packet) {
				this._frameServer.pushH264Packet(
					packet.data,
					packet.pts,
					packet.dts,
					packet.isKeyframe
				);
				this._lastEncodedPacket = packet;
			}
		} catch (error) {
			console.error('[PreviewOutputAdapter] NV12 encoding failed:', error);
		}
	}

	/**
	 * 输出渲染帧（CPU 路径）
	 */
	async outputFrame(frame: RenderedFrame): Promise<void> {
		if (this._disposed || !this._frameServer) {
			return;
		}

		// Hybrid mode: choose output format based on preview mode
		if (this._previewMode === 'idle') {
			// Idle mode: output high-quality JPEG
			if (this._frameServer.pushFrame) {
				// Convert RGBA to JPEG using sharp (if available)
				try {
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					const sharp = require('sharp');
					const jpegBuffer = await sharp(frame.data, {
						raw: {
							width: frame.width,
							height: frame.height,
							channels: 4,
						},
					})
						.jpeg({ quality: this._hybridConfig.idle.quality })
						.toBuffer();

					this._frameServer.pushFrame(
						jpegBuffer,
						Math.round(frame.timestamp * 1_000_000),
						frame.width,
						frame.height
					);
				} catch (error) {
					console.error('[PreviewOutputAdapter] JPEG conversion failed:', error);
				}
			}
		} else {
			// Playback/Scrubbing mode: encode to H.264
			if (this._encoder) {
				try {
					const packet = this._encoder.encodeRGBA(
						frame.data,
						frame.width,
						frame.height,
						this._frameIndex++
					);

					if (packet && this._frameServer.pushH264Packet) {
						this._frameServer.pushH264Packet(
							packet.data,
							packet.pts,
							packet.dts,
							packet.isKeyframe
						);
						this._lastEncodedPacket = packet;
					}
				} catch (error) {
					console.error('[PreviewOutputAdapter] H.264 encoding failed:', error);
				}
			}
		}
	}

	/**
	 * 输出音频数据
	 * 注意：音频由 neko-engine 直接处理，此方法为空实现
	 */
	async outputAudio(_buffer: AudioBuffer): Promise<void> {
		// Audio is handled by neko-engine directly, not through this adapter
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
	_audioServer: unknown, // Deprecated, kept for API compatibility
	rustService: RustMediaProcessorService | null
): PreviewOutputAdapter {
	return new PreviewOutputAdapter(frameServer, rustService);
}
