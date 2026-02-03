/**
 * Render Pipeline Module
 *
 * 共享渲染管线模块，提供预览和导出共用的渲染能力
 *
 * 架构：
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │              Shared Render Pipeline (共享渲染管线)               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  视频: ffmpeg 硬解(NV12) → wgpu(NV12→RGBA→合成→RGBA→NV12) → NV12 │
 * │  音频: ffmpeg ──解封+解码──→ 混音器 ──→ AudioBuffer             │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *               ┌───────────────┴───────────────┐
 *               ▼                               ▼
 *        PreviewOutputAdapter           ExportOutputAdapter
 *        NV12 → H.264 → WebSocket       NV12 → 硬件编码 → 文件
 * ```
 */

// Interfaces
export type {
	IRenderPipeline,
	IOutputAdapter,
	IPreviewOutputAdapter,
	IExportOutputAdapter,
	NV12Texture,
	RenderedFrame,
	EncodedVideoPacket,
	AudioBuffer,
	CompositeLayerConfig,
	RenderPipelineConfig,
	PreviewEncoderConfig,
	ExportAdapterConfig,
	BackpressureStatus,
	// Hybrid preview mode types
	PreviewMode,
	HybridPreviewConfig,
} from './IRenderPipeline';

// Implementations
export { SharedRenderPipeline, createSharedRenderPipeline } from './SharedRenderPipeline';
export { PreviewOutputAdapter, createPreviewOutputAdapter } from './PreviewOutputAdapter';
export { ExportOutputAdapter, createExportOutputAdapter } from './ExportOutputAdapter';
