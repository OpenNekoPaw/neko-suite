/**
 * SharedRenderPipeline - 共享渲染管线实现
 *
 * 职责：
 * - 实现 IRenderPipeline 接口
 * - 使用 RustMediaProcessorService 解码视频帧 (硬件解码 → NV12/RGBA)
 * - 使用 RustMediaProcessorService (wgpu) 进行多轨道合成
 * - 使用 StreamingAudioDecoderService 处理音频
 *
 * 架构（零拷贝）：
 * ```
 * ffmpeg 硬解(NV12) → wgpu(NV12→RGBA→合成→RGBA→NV12) → NV12
 * StreamingAudioDecoderService (音频解码) → AudioBuffer
 * ```
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责渲染逻辑
 * - 依赖倒置 (D)：依赖 RustMediaProcessorService 接口
 */

import type { ProjectData } from '@uniedit/shared';
import type { RustMediaProcessorService } from '../RustMediaProcessorService';
import type {
	IRenderPipeline,
	NV12Texture,
	RenderedFrame,
	AudioBuffer,
	CompositeLayerConfig,
	RenderPipelineConfig,
} from './IRenderPipeline';

// =============================================================================
// Types
// =============================================================================

interface CompositeLayerData {
	data: Buffer;
	width: number;
	height: number;
	transform?: {
		x?: number;
		y?: number;
		scaleX?: number;
		scaleY?: number;
		rotation?: number;
		anchorX?: number;
		anchorY?: number;
	};
	opacity?: number;
	blendMode?: string;
	zIndex?: number;
}

// =============================================================================
// SharedRenderPipeline Implementation
// =============================================================================

/**
 * 共享渲染管线
 *
 * 预览和导出共用的渲染逻辑
 * 使用 RustMediaProcessorService 进行硬件解码和 GPU 合成
 */
export class SharedRenderPipeline implements IRenderPipeline {
	private _rustService: RustMediaProcessorService | null = null;
	private _projectData: ProjectData | null = null;
	private _projectRoot: string = '';
	private _compositeLayers: CompositeLayerConfig[] = [];
	private _config: RenderPipelineConfig = {
		outputWidth: 1920,
		outputHeight: 1080,
		fps: 30,
		backgroundColor: [0, 0, 0, 255],
	};
	private _disposed = false;
	private _frameIndex = 0;

	constructor(rustService: RustMediaProcessorService | null) {
		this._rustService = rustService;
	}

	// =========================================================================
	// IRenderPipeline Implementation
	// =========================================================================

	/**
	 * 处理单帧视频，输出 NV12 纹理
	 *
	 * 流程：ffmpeg 硬解(NV12) → wgpu(NV12→RGBA→合成→RGBA→NV12) → NV12
	 */
	async processFrameToNV12(timestamp: number): Promise<NV12Texture | null> {
		if (this._disposed || !this._rustService) {
			return null;
		}

		// TODO(P0): Implement NV12 zero-copy pipeline
		// 1. Decode to NV12 using hardware decoder
		// 2. Convert NV12 → RGBA using wgpu shader
		// 3. Composite multiple layers using wgpu
		// 4. Convert RGBA → NV12 using wgpu shader
		// 5. Return NV12 texture for encoding

		// For now, use RGBA path and convert to NV12
		const rgbaFrame = await this.processFrame(timestamp);
		if (!rgbaFrame) {
			return null;
		}

		// Convert RGBA to NV12 using GPU
		const nv12Data = this._rgbaToNv12(rgbaFrame.data, rgbaFrame.width, rgbaFrame.height);
		if (!nv12Data) {
			// GPU conversion failed, drop this frame
			console.warn(`[SharedRenderPipeline] Dropping frame at ${timestamp}s: GPU rgbaToNv12 failed`);
			return null;
		}

		return {
			yPlane: nv12Data.yPlane,
			uvPlane: nv12Data.uvPlane,
			width: rgbaFrame.width,
			height: rgbaFrame.height,
			timestamp: rgbaFrame.timestamp,
			frameIndex: rgbaFrame.frameIndex,
			colorSpace: 1, // BT.709
		};
	}

	/**
	 * 处理单帧视频，输出 RGBA（兼容模式）
	 */
	async processFrame(timestamp: number): Promise<RenderedFrame | null> {
		if (this._disposed || !this._rustService) {
			return null;
		}

		// Use wgpu compositor if available and has layers
		if (this._compositeLayers.length > 0 && this._rustService.isCompositorAvailable()) {
			return this._compositeFrameWithWgpu(timestamp);
		}

		// Fallback to single video mode
		return this._processSingleVideoFrame(timestamp);
	}

	/**
	 * 处理音频片段
	 */
	async processAudio(startTime: number, duration: number): Promise<AudioBuffer | null> {
		// TODO(P1): Implement audio processing using StreamingAudioDecoderService
		// For now, return null - audio will be handled separately
		return null;
	}

	/**
	 * 设置项目数据
	 */
	setProject(project: ProjectData, projectRoot: string): void {
		this._projectData = project;
		this._projectRoot = projectRoot;
	}

	/**
	 * 设置合成层配置
	 */
	setCompositeLayers(layers: CompositeLayerConfig[]): void {
		this._compositeLayers = layers;
	}

	/**
	 * 设置渲染配置
	 */
	setConfig(config: RenderPipelineConfig): void {
		this._config = { ...this._config, ...config };
	}

	/**
	 * 检查渲染管线是否可用
	 */
	isAvailable(): boolean {
		return !this._disposed && this._rustService !== null && this._rustService.isAvailable();
	}

	/**
	 * 检查 wgpu 合成器是否可用
	 */
	isCompositorAvailable(): boolean {
		return this._rustService?.isCompositorAvailable() ?? false;
	}

	/**
	 * 检查 NV12 零拷贝管线是否可用
	 */
	isZeroCopyAvailable(): boolean {
		// Check if hardware decoder is available
		return this._rustService?.isHwDecoderAvailable() ?? false;
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		// RustMediaProcessorService is managed externally, don't dispose
		this._rustService = null;
		this._projectData = null;
		this._compositeLayers = [];
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	/**
	 * 使用 wgpu 进行多轨道视频合成
	 *
	 * 流程：RustMediaProcessorService.decodeFrame('rgba', hwAccel) → wgpu composite → RGBA
	 */
	private async _compositeFrameWithWgpu(timestamp: number): Promise<RenderedFrame | null> {
		if (!this._rustService?.isCompositorAvailable()) {
			return null;
		}

		// Get active layers at current timestamp
		const activeLayers = this._compositeLayers.filter(layer => {
			const layerStart = layer.startTime;
			const layerEnd = layer.startTime + layer.duration;
			return timestamp >= layerStart && timestamp < layerEnd;
		});

		if (activeLayers.length === 0) {
			return null;
		}

		// Decode frames for all active layers using RustMediaProcessorService
		const compositeLayerData: CompositeLayerData[] = [];

		for (const layer of activeLayers) {
			// Calculate video internal time
			const videoTime = layer.trimStart + (timestamp - layer.startTime);

			try {
				// Use RustMediaProcessorService to decode frame with hardware acceleration
				// Output format: RGBA (hardware decoder will output NV12, then convert to RGBA via GPU)
				const frameData = this._rustService.decodeFrame(
					layer.videoPath,
					videoTime,
					'rgba', // Output format: RGBA
					true    // Use hardware acceleration
				);

				if (!frameData) {
					console.warn(
						`[SharedRenderPipeline] Failed to decode frame for ${layer.videoPath} at ${videoTime}s`
					);
					continue;
				}

				compositeLayerData.push({
					data: frameData.data,
					width: frameData.width,
					height: frameData.height,
					transform: layer.transform,
					opacity: layer.opacity,
					blendMode: layer.blendMode,
					zIndex: layer.zIndex,
				});
			} catch (error) {
				console.warn(
					`[SharedRenderPipeline] Failed to decode frame for ${layer.videoPath}:`,
					error
				);
				continue;
			}
		}

		if (compositeLayerData.length === 0) {
			return null;
		}

		// Use wgpu to composite
		try {
			const result = this._rustService.composite(
				compositeLayerData,
				this._config.outputWidth,
				this._config.outputHeight,
				this._config.backgroundColor
			);

			const frameIndex = this._frameIndex++;

			return {
				data: Buffer.from(result.data),
				width: result.width,
				height: result.height,
				timestamp,
				frameIndex,
			};
		} catch (error) {
			console.error('[SharedRenderPipeline] wgpu composite failed:', error);
			return null;
		}
	}

	/**
	 * 处理单视频帧（无合成）
	 *
	 * 流程：RustMediaProcessorService.decodeFrame('rgba', hwAccel) → RGBA
	 */
	private async _processSingleVideoFrame(timestamp: number): Promise<RenderedFrame | null> {
		if (!this._rustService) {
			return null;
		}

		// Get first layer's video path
		const videoPath = this._compositeLayers[0]?.videoPath;
		if (!videoPath) {
			return null;
		}

		try {
			// Use RustMediaProcessorService to decode frame with hardware acceleration
			const frameData = this._rustService.decodeFrame(
				videoPath,
				timestamp,
				'rgba', // Output format: RGBA
				true    // Use hardware acceleration
			);

			if (!frameData) {
				console.error('[SharedRenderPipeline] Failed to decode single video frame');
				return null;
			}

			const frameIndex = this._frameIndex++;

			return {
				data: frameData.data,
				width: frameData.width,
				height: frameData.height,
				timestamp,
				frameIndex,
			};
		} catch (error) {
			console.error('[SharedRenderPipeline] Failed to process single video frame:', error);
			return null;
		}
	}

	/**
	 * 将 RGBA 转换为 NV12 格式（仅 GPU）
	 *
	 * NV12 格式：
	 * - Y 平面：width * height 字节
	 * - UV 平面：width/2 * height/2 * 2 字节（交错 U/V）
	 *
	 * 使用 GPU 加速版本，失败时返回 null（丢弃帧）。
	 */
	private _rgbaToNv12(
		rgbaData: Buffer,
		width: number,
		height: number
	): { yPlane: Buffer; uvPlane: Buffer } | null {
		if (!this._rustService) {
			return null;
		}

		try {
			const rgbaFrame = {
				data: rgbaData,
				width,
				height,
				format: 'rgba',
				timestamp: 0,
				isKeyframe: true,
			};

			const nv12Frame = this._rustService.rgbaToNv12(rgbaFrame, 1); // BT.709
			if (nv12Frame && nv12Frame.format === 'nv12') {
				const ySize = width * height;
				const yPlane = Buffer.from(nv12Frame.data.subarray(0, ySize));
				const uvPlane = Buffer.from(nv12Frame.data.subarray(ySize));
				return { yPlane, uvPlane };
			}
			return null;
		} catch (error) {
			console.warn('[SharedRenderPipeline] GPU rgbaToNv12 failed:', error);
			return null;
		}
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * 创建共享渲染管线
 */
export function createSharedRenderPipeline(
	rustService: RustMediaProcessorService | null
): SharedRenderPipeline {
	return new SharedRenderPipeline(rustService);
}
