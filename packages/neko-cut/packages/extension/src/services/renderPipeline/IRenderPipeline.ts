/**
 * IRenderPipeline - 共享渲染管线接口
 *
 * 职责：
 * - 定义预览和导出共用的渲染管线抽象
 * - 统一视频帧处理和音频处理接口
 *
 * 架构（符合 docs/video-editor-principles.md）：
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
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：IRenderPipeline 只负责渲染，IOutputAdapter 只负责输出
 * - 开闭原则 (O)：通过接口扩展新的输出适配器
 * - 依赖倒置 (D)：高层模块依赖抽象接口
 */

import type { ProjectData } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * NV12 纹理数据（GPU 内存）
 *
 * NV12 格式：
 * - Y 平面：全分辨率，每像素 1 字节（亮度）
 * - UV 平面：半分辨率，每像素 2 字节（交错的 Cb/Cr）
 */
export interface NV12Texture {
	/** Y 平面数据 */
	yPlane: Buffer;
	/** UV 平面数据 */
	uvPlane: Buffer;
	/** 帧宽度 */
	width: number;
	/** 帧高度 */
	height: number;
	/** 时间戳（秒） */
	timestamp: number;
	/** 帧索引 */
	frameIndex: number;
	/** 色彩空间 (0=BT.601, 1=BT.709, 2=BT.2020) */
	colorSpace?: number;
}

/**
 * 渲染后的帧数据（RGBA 格式，用于兼容模式）
 */
export interface RenderedFrame {
	/** RGBA 原始数据 */
	data: Buffer;
	/** 帧宽度 */
	width: number;
	/** 帧高度 */
	height: number;
	/** 时间戳（秒） */
	timestamp: number;
	/** 帧索引 */
	frameIndex: number;
}

/**
 * 编码后的视频包
 */
export interface EncodedVideoPacket {
	/** 编码数据（H.264/H.265 NAL 单元） */
	data: Buffer;
	/** PTS（显示时间戳，微秒） */
	pts: number;
	/** DTS（解码时间戳，微秒） */
	dts: number;
	/** 是否为关键帧 */
	isKeyframe: boolean;
	/** 帧索引 */
	frameIndex: number;
}

/**
 * 音频缓冲区
 */
export interface AudioBuffer {
	/** PCM 数据（Float32 交错格式） */
	data: Buffer;
	/** 采样率 */
	sampleRate: number;
	/** 声道数 */
	channels: number;
	/** 开始时间（秒） */
	startTime: number;
	/** 持续时间（秒） */
	duration: number;
}

/**
 * 合成层配置
 */
export interface CompositeLayerConfig {
	/** 视频路径 */
	videoPath: string;
	/** 时间线开始时间 */
	startTime: number;
	/** 裁剪开始时间 */
	trimStart: number;
	/** 持续时间 */
	duration: number;
	/** 变换参数 */
	transform?: {
		x?: number;
		y?: number;
		scaleX?: number;
		scaleY?: number;
		rotation?: number;
		anchorX?: number;
		anchorY?: number;
	};
	/** 不透明度 (0-1) */
	opacity?: number;
	/** 混合模式 */
	blendMode?: string;
	/** Z 轴顺序 */
	zIndex?: number;
}

/**
 * 渲染管线配置
 */
export interface RenderPipelineConfig {
	/** 输出宽度 */
	outputWidth: number;
	/** 输出高度 */
	outputHeight: number;
	/** 帧率 */
	fps: number;
	/** 背景色 [r, g, b, a]，范围 0-255 */
	backgroundColor?: [number, number, number, number];
}

/**
 * 预览编码配置
 */
export interface PreviewEncoderConfig {
	/** 编码器 (h264, h265) */
	codec: 'h264' | 'h265';
	/** 比特率 (bps) */
	bitrate: number;
	/** 帧率 */
	fps: number;
	/** 宽度 */
	width: number;
	/** 高度 */
	height: number;
	/** 预设 (ultrafast, fast, medium) */
	preset?: string;
	/** 使用硬件加速 */
	hardwareAccel?: boolean;
}

// =============================================================================
// Hybrid Preview Mode Types
// =============================================================================

/**
 * 预览模式
 *
 * - idle: 静止状态，输出高质量 JPEG
 * - playback: 播放状态，输出 H.264 流
 * - scrubbing: 拖动状态，输出 H.264 流（低延迟）
 */
export type PreviewMode = 'idle' | 'playback' | 'scrubbing';

/**
 * 混合预览策略配置
 */
export interface HybridPreviewConfig {
	/** Idle 模式配置 */
	idle: {
		/** 输出格式 */
		format: 'jpeg' | 'png';
		/** JPEG 质量 (1-100) */
		quality: number;
		/** 停止操作后延迟切换到 Idle 模式 (ms) */
		debounceMs: number;
	};
	/** Streaming 模式配置 (Playback/Scrubbing) */
	streaming: {
		/** 编码器 */
		codec: 'h264' | 'h265';
		/** 比特率 (bps) */
		bitrate: number;
		/** 编码预设 */
		preset: 'ultrafast' | 'fast' | 'medium';
		/** 关键帧间隔 (帧数) */
		keyframeInterval: number;
	};
}

// =============================================================================
// Interfaces
// =============================================================================

/**
 * 共享渲染管线接口
 *
 * 负责将项目数据渲染为 NV12 纹理，供预览和导出使用
 *
 * 流程：
 * 1. ffmpeg 硬件解码 → NV12
 * 2. wgpu: NV12 → RGBA (GPU Shader)
 * 3. wgpu: 多轨道合成渲染 (GPU)
 * 4. wgpu: RGBA → NV12 (GPU Shader)
 * 5. 输出 NV12 纹理
 */
export interface IRenderPipeline {
	/**
	 * 处理单帧视频，输出 NV12 纹理
	 * @param timestamp 时间戳（秒）
	 * @returns NV12 纹理数据
	 */
	processFrameToNV12(timestamp: number): Promise<NV12Texture | null>;

	/**
	 * 处理单帧视频，输出 RGBA（兼容模式）
	 * @param timestamp 时间戳（秒）
	 * @returns RGBA 帧数据
	 */
	processFrame(timestamp: number): Promise<RenderedFrame | null>;

	/**
	 * 处理音频片段
	 * @param startTime 开始时间（秒）
	 * @param duration 持续时间（秒）
	 * @returns 音频缓冲区
	 */
	processAudio(startTime: number, duration: number): Promise<AudioBuffer | null>;

	/**
	 * 设置项目数据
	 * @param project 项目数据
	 * @param projectRoot 项目根目录
	 */
	setProject(project: ProjectData, projectRoot: string): void;

	/**
	 * 设置合成层配置
	 * @param layers 合成层配置数组
	 */
	setCompositeLayers(layers: CompositeLayerConfig[]): void;

	/**
	 * 设置渲染配置
	 * @param config 渲染配置
	 */
	setConfig(config: RenderPipelineConfig): void;

	/**
	 * 检查渲染管线是否可用
	 */
	isAvailable(): boolean;

	/**
	 * 检查 NV12 零拷贝管线是否可用
	 */
	isZeroCopyAvailable(): boolean;

	/**
	 * 释放资源
	 */
	dispose(): void;
}

/**
 * 输出适配器接口
 *
 * 负责将渲染后的帧数据输出到不同目标（预览/导出）
 */
export interface IOutputAdapter {
	/** 适配器名称 */
	readonly name: string;

	/**
	 * 输出视频帧（NV12 格式）
	 * @param texture NV12 纹理数据
	 */
	outputVideoNV12?(texture: NV12Texture): Promise<void>;

	/**
	 * 输出视频帧（RGBA 格式，兼容模式）
	 * @param frame 渲染后的帧数据
	 */
	outputVideo(frame: RenderedFrame): Promise<void>;

	/**
	 * 输出音频数据
	 * @param buffer 音频缓冲区
	 */
	outputAudio(buffer: AudioBuffer): Promise<void>;

	/**
	 * 完成输出（用于导出时的最终处理）
	 */
	finalize(): Promise<void>;

	/**
	 * 释放资源
	 */
	dispose(): void;
}

/**
 * 预览输出适配器扩展接口
 *
 * 支持混合预览模式：
 * - Idle: 高质量 JPEG 截图
 * - Playback/Scrubbing: H.264 流输出到 WebSocket
 */
export interface IPreviewOutputAdapter extends IOutputAdapter {
	/**
	 * 初始化预览编码器
	 * @param config 编码配置
	 */
	initializeEncoder(config: PreviewEncoderConfig): Promise<void>;

	/**
	 * 获取编码后的视频包（用于 WebSocket 传输）
	 */
	getEncodedPacket(): EncodedVideoPacket | null;

	/**
	 * 检查编码器是否可用
	 */
	isEncoderAvailable(): boolean;

	/**
	 * 设置预览模式
	 * @param mode 预览模式
	 */
	setPreviewMode(mode: PreviewMode): void;

	/**
	 * 获取当前预览模式
	 */
	getPreviewMode(): PreviewMode;

	/**
	 * 设置混合预览配置
	 * @param config 混合预览配置
	 */
	setHybridConfig(config: HybridPreviewConfig): void;

	/**
	 * 输出静态帧（Idle 模式，高质量 JPEG）
	 * @param frame 渲染后的帧数据
	 */
	outputStaticFrame(frame: RenderedFrame): Promise<void>;
}

/**
 * 导出输出适配器扩展接口
 *
 * 用于导出场景，支持背压控制
 */
export interface IExportOutputAdapter extends IOutputAdapter {
	/**
	 * 初始化导出
	 * @param outputPath 输出文件路径
	 * @param config 导出配置
	 */
	initialize(outputPath: string, config: ExportAdapterConfig): Promise<void>;

	/**
	 * 获取背压状态
	 */
	getBackpressureStatus(): BackpressureStatus;

	/**
	 * 等待背压容量
	 */
	waitForCapacity(): Promise<boolean>;
}

/**
 * 导出适配器配置
 */
export interface ExportAdapterConfig {
	/** 视频编码器 */
	videoCodec: string;
	/** 音频编码器 */
	audioCodec: string;
	/** 视频比特率 */
	videoBitrate: number;
	/** 音频比特率 */
	audioBitrate: number;
	/** 帧率 */
	fps: number;
	/** 宽度 */
	width: number;
	/** 高度 */
	height: number;
	/** 总帧数 */
	totalFrames: number;
	/** 容器格式 */
	format: 'mp4' | 'webm';
	/** 硬件加速 */
	hardwareAccel?: boolean;
	/** 编码预设 */
	preset?: string;
}

/**
 * 背压状态
 */
export interface BackpressureStatus {
	/** 待处理帧数 */
	pendingFrames: number;
	/** 是否应该暂停 */
	shouldPause: boolean;
	/** 最大待处理帧数 */
	maxPendingFrames: number;
}
