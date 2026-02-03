/**
 * Media Processing Protocol
 *
 * 定义 Webview 和 Extension 之间的媒体处理 IPC 协议
 *
 * Phase 4 更新：
 * - 新增 ExtensionCacheStats 类型
 * - 简化合成请求（标记为 deprecated）
 * - Extension 端仅负责单轨解码，合成移至 Webview GPU
 *
 * 职责：
 * - 定义媒体请求/响应消息类型
 * - 定义媒体信息结构
 * - 保证类型安全的 IPC 通信
 */

// =============================================================================
// Media Request Types
// =============================================================================

/**
 * 媒体请求基础类型
 */
interface BaseMediaRequest {
	/** 请求 ID，用于匹配响应 */
	requestId: string;
	/** 请求时间戳 */
	timestamp: number;
}

/**
 * 视频帧提取请求
 */
export interface GetVideoFrameRequest extends BaseMediaRequest {
	type: 'media:getVideoFrame';
	payload: {
		/** 视频文件路径（相对或绝对路径） */
		videoPath: string;
		/** 时间点（秒） */
		timeInSeconds: number;
		/** Phase 2: 质量参数（可选） */
		quality?: number;
		/** Phase 2: 缩放比例（可选，0-1） */
		scale?: number;
	};
}

/**
 * 批量视频帧提取请求（用于预加载）
 * 使用流式提取，比逐帧请求更高效
 */
export interface GetVideoFrameRangeRequest extends BaseMediaRequest {
	type: 'media:getVideoFrameRange';
	payload: {
		/** 视频文件路径 */
		videoPath: string;
		/** 开始时间（秒） */
		startTime: number;
		/** 持续时间（秒） */
		duration: number;
		/** 帧率 */
		fps: number;
		/** Phase 2: 质量参数（可选） */
		quality?: number;
		/** Phase 2: 缩放比例（可选，0-1） */
		scale?: number;
		/** 最大帧数限制（可选，防止 Webview 内存溢出） */
		maxFrames?: number;
	};
}

/**
 * 音频段解码请求
 */
export interface DecodeAudioSegmentRequest extends BaseMediaRequest {
	type: 'media:decodeAudioSegment';
	payload: {
		/** 视频文件路径 */
		videoPath: string;
		/** 开始时间（秒） */
		startTime: number;
		/** 持续时间（秒） */
		duration: number;
		/** 采样率（可选，默认 48000） */
		sampleRate?: number;
		/** 声道数（可选，默认 2） */
		channels?: number;
	};
}

/**
 * 媒体信息探测请求
 */
export interface ProbeMediaInfoRequest extends BaseMediaRequest {
	type: 'media:probeMediaInfo';
	payload: {
		/** 视频文件路径 */
		videoPath: string;
	};
}

/**
 * 字幕流信息
 */
export interface SubtitleStream {
	/** 流索引 */
	index: number;
	/** 编码格式 (subrip, ass, webvtt, etc.) */
	codec: string;
	/** 语言代码 (eng, chi, etc.) */
	language?: string;
	/** 标题 */
	title?: string;
	/** 是否默认 */
	isDefault?: boolean;
	/** 是否强制 */
	isForced?: boolean;
}

/**
 * 字幕提取请求 - 自动提取全部字幕流
 */
export interface ExtractSubtitlesRequest extends BaseMediaRequest {
	type: 'media:extractSubtitles';
	payload: {
		/** 视频文件路径 */
		videoPath: string;
	};
}

/**
 * Phase 2.5: 合成轨道定义
 */
export interface CompositeTrack {
	/** 视频文件路径 */
	videoPath: string;
	/** X 位置（像素） */
	x: number;
	/** Y 位置（像素） */
	y: number;
	/** 宽度（像素） */
	width: number;
	/** 高度（像素） */
	height: number;
	/** 不透明度（0-1，可选，默认 1） */
	opacity?: number;
	/** 混合模式（可选，默认 'normal'） */
	blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
	/** 特效列表（可选） */
	effects?: CompositeTrackEffect[];
}

/**
 * Phase 2.5: 轨道特效定义
 */
export interface CompositeTrackEffect {
	type: 'blur' | 'colorCorrection' | 'brightness' | 'contrast';
	// Blur
	radius?: number;
	// Color Correction
	brightness?: number;
	contrast?: number;
	saturation?: number;
	hue?: number;
}

/**
 * Phase 2.5: 多轨道合成帧请求
 * Extension 端使用 FFmpeg 合成多个视频轨道
 *
 * @deprecated Phase 4: 合成功能将迁移到 Webview 端 GPU 渲染
 * 请使用 GPURenderEngine 进行多轨合成
 */
export interface GetCompositeFrameRequest extends BaseMediaRequest {
	type: 'media:getCompositeFrame';
	payload: {
		/** 轨道列表（从下到上叠加） */
		tracks: CompositeTrack[];
		/** 时间点（秒） */
		timeInSeconds: number;
		/** 输出宽度 */
		width: number;
		/** 输出高度 */
		height: number;
		/** Phase 2: 质量参数（可选） */
		quality?: number;
		/** Phase 2: 缩放比例（可选，0-1） */
		scale?: number;
	};
}

/**
 * Phase 2.5: 多轨道合成批量帧请求
 *
 * @deprecated Phase 4: 合成功能将迁移到 Webview 端 GPU 渲染
 * 请使用 GPURenderEngine 进行多轨合成
 */
export interface GetCompositeFrameRangeRequest extends BaseMediaRequest {
	type: 'media:getCompositeFrameRange';
	payload: {
		/** 轨道列表（从下到上叠加） */
		tracks: CompositeTrack[];
		/** 开始时间（秒） */
		startTime: number;
		/** 持续时间（秒） */
		duration: number;
		/** 帧率 */
		fps: number;
		/** 输出宽度 */
		width: number;
		/** 输出高度 */
		height: number;
		/** Phase 2: 质量参数（可选） */
		quality?: number;
		/** Phase 2: 缩放比例（可选，0-1） */
		scale?: number;
	};
}

/**
 * 所有媒体请求类型的联合
 *
 * Note: GetCompositeFrameRequest and GetCompositeFrameRangeRequest are removed.
 * Use GPURenderEngine for GPU-based multi-track composition in Webview.
 */
export type MediaRequest =
	| GetVideoFrameRequest
	| GetVideoFrameRangeRequest
	| DecodeAudioSegmentRequest
	| ProbeMediaInfoRequest
	| ExtractSubtitlesRequest;

// =============================================================================
// Media Response Types
// =============================================================================

/**
 * 媒体响应基础类型
 */
interface BaseMediaResponse {
	/** 对应的请求 ID */
	requestId: string;
	/** 响应类型 */
	type: string;
	/** 错误信息（如果失败） */
	error?: string;
}

/**
 * 视频帧提取响应
 */
export interface GetVideoFrameResponse extends BaseMediaResponse {
	type: 'media:response:getVideoFrame';
	payload?: {
		/** Base64 编码的图片数据 URL（旧格式，兼容性） */
		imageDataUrl?: string;
		/** 原始图片数据（新格式，更高效） */
		imageBuffer?: ArrayBuffer;
		/** 图片 MIME 类型（新格式） */
		mimeType?: string;
	};
}

/**
 * 批量视频帧提取响应
 */
export interface GetVideoFrameRangeResponse extends BaseMediaResponse {
	type: 'media:response:getVideoFrameRange';
	payload?: {
		/** 帧数据数组 */
		frames: Array<{
			/** 帧时间（秒） */
			time: number;
			/** 帧图片数据 (ArrayBuffer, 可能在 postMessage 序列化时丢失) */
			imageBuffer?: ArrayBuffer;
			/** 帧图片 base64 Data URL (推荐格式，可靠传输) */
			imageDataUrl?: string;
		}>;
		/** 图片 MIME 类型 */
		mimeType?: string;
	};
}

/**
 * 音频段解码响应
 */
export interface DecodeAudioSegmentResponse extends BaseMediaResponse {
	type: 'media:response:decodeAudioSegment';
	payload?: {
		/** 原始 PCM 音频数据（ArrayBuffer） */
		buffer: ArrayBuffer;
		/** 采样率 */
		sampleRate: number;
		/** 声道数 */
		channels: number;
		/** 实际持续时间 */
		duration: number;
	};
}

/**
 * 媒体信息探测响应
 */
export interface ProbeMediaInfoResponse extends BaseMediaResponse {
	type: 'media:response:probeMediaInfo';
	payload?: MediaInfo;
}

/**
 * 提取的字幕轨道数据
 */
export interface ExtractedSubtitleTrack {
	/** 流索引 */
	streamIndex: number;
	/** 语言代码 */
	language?: string;
	/** 标题 */
	title?: string;
	/** 是否默认 */
	isDefault: boolean;
	/** 字幕条目列表 */
	cues: SubtitleCueData[];
}

/**
 * 字幕条目数据（用于 IPC 传输）
 */
export interface SubtitleCueData {
	/** 唯一标识 */
	id: string;
	/** 开始时间（秒） */
	startTime: number;
	/** 结束时间（秒） */
	endTime: number;
	/** 字幕文本 */
	text: string;
}

/**
 * 字幕提取响应 - 返回所有字幕轨道
 */
export interface ExtractSubtitlesResponse extends BaseMediaResponse {
	type: 'media:response:extractSubtitles';
	payload?: {
		tracks: ExtractedSubtitleTrack[];
	};
}

/**
 * Phase 2.5: 合成帧响应
 */
export interface GetCompositeFrameResponse extends BaseMediaResponse {
	type: 'media:response:getCompositeFrame';
	payload?: {
		/** 合成后的图片数据 */
		imageBuffer: ArrayBuffer;
		/** 图片 MIME 类型 */
		mimeType: string;
	};
}

/**
 * Phase 2.5: 批量合成帧响应
 */
export interface GetCompositeFrameRangeResponse extends BaseMediaResponse {
	type: 'media:response:getCompositeFrameRange';
	payload?: {
		/** 帧数据数组 */
		frames: Array<{
			/** 帧时间（秒） */
			time: number;
			/** 帧图片数据 */
			imageBuffer: ArrayBuffer;
		}>;
		/** 图片 MIME 类型 */
		mimeType: string;
	};
}

/**
 * 所有媒体响应类型的联合
 *
 * Note: GetCompositeFrameResponse and GetCompositeFrameRangeResponse are removed.
 * Use GPURenderEngine for GPU-based multi-track composition in Webview.
 */
export type MediaResponse =
	| GetVideoFrameResponse
	| GetVideoFrameRangeResponse
	| DecodeAudioSegmentResponse
	| ProbeMediaInfoResponse
	| ExtractSubtitlesResponse;

// =============================================================================
// Media Info Types
// =============================================================================

/**
 * 媒体文件信息
 */
export interface MediaInfo {
	/** 视频时长（秒） */
	duration: number;
	/** 视频宽度 */
	width: number;
	/** 视频高度 */
	height: number;
	/** 帧率 */
	fps: number;
	/** 视频编码格式 */
	codec: string;
	/** 容器格式 */
	format: string;
	/** 视频码率（bps） */
	bitrate?: number;
	/** 是否包含音频流 */
	hasAudio: boolean;
	/** 音频编码格式（如果有） */
	audioCodec?: string;
	/** 音频采样率（如果有） */
	audioSampleRate?: number;
	/** 音频声道数（如果有） */
	audioChannels?: number;
	/** 音频码率（bps，如果有） */
	audioBitrate?: number;
	/** 是否包含字幕流 */
	hasSubtitles: boolean;
	/** 字幕流信息列表 */
	subtitleStreams?: SubtitleStream[];
}

// =============================================================================
// YUV420P Frame Data Types (Zero-copy video decoding)
// =============================================================================

/**
 * YUV 色彩空间标准
 *
 * 不同分辨率的视频使用不同的色彩空间标准：
 * - BT.601: SD 视频 (DVD, 标清广播)
 * - BT.709: HD 视频 (HDTV, Blu-ray, 1080p)
 * - BT.2020: UHD/4K 视频 (HDR)
 */
export enum YuvColorSpace {
	/** BT.601 - SD 视频 (< 720p) */
	BT601 = 0,
	/** BT.709 - HD 视频 (720p - 1080p) */
	BT709 = 1,
	/** BT.2020 - UHD/4K 视频 (> 1080p) */
	BT2020 = 2,
}

/**
 * 根据视频分辨率检测色彩空间
 */
export function detectYuvColorSpace(width: number, height: number): YuvColorSpace {
	if (width >= 3840 || height >= 2160) {
		return YuvColorSpace.BT2020;
	}
	if (width >= 1280 || height >= 720) {
		return YuvColorSpace.BT709;
	}
	return YuvColorSpace.BT601;
}

/**
 * YUV420P 帧数据
 *
 * YUV420P 是 FFmpeg 默认的解码输出格式，数据布局：
 * - Y 平面：width × height 字节（亮度）
 * - U 平面：(width/2) × (height/2) 字节（色度 Cb）
 * - V 平面：(width/2) × (height/2) 字节（色度 Cr）
 * - 总大小：width × height × 1.5 字节
 *
 * 相比 RGBA 格式（width × height × 4 字节），YUV420P 节省约 62.5% 的内存和带宽。
 */
export interface Yuv420pFrameData {
	/** 帧时间（秒） */
	time: number;
	/** 帧宽度 */
	width: number;
	/** 帧高度 */
	height: number;
	/** 像素格式标识 */
	pixelFormat: 'yuv420p';
	/** 色彩空间 */
	colorSpace: YuvColorSpace;
	/** Y 平面数据（亮度，全分辨率） */
	yPlane: Uint8Array;
	/** U 平面数据（色度 Cb，半分辨率） */
	uPlane: Uint8Array;
	/** V 平面数据（色度 Cr，半分辨率） */
	vPlane: Uint8Array;
}

/**
 * 计算 YUV420P 帧的各平面大小
 */
export function calculateYuv420pPlaneSizes(width: number, height: number): {
	ySize: number;
	uSize: number;
	vSize: number;
	totalSize: number;
} {
	const ySize = width * height;
	const uvSize = (width / 2) * (height / 2);
	return {
		ySize,
		uSize: uvSize,
		vSize: uvSize,
		totalSize: ySize + uvSize * 2,
	};
}

/**
 * 从连续的 YUV420P 缓冲区解析出各平面
 */
export function parseYuv420pBuffer(
	buffer: Uint8Array,
	width: number,
	height: number
): { yPlane: Uint8Array; uPlane: Uint8Array; vPlane: Uint8Array } | null {
	const sizes = calculateYuv420pPlaneSizes(width, height);

	if (buffer.length < sizes.totalSize) {
		console.error(
			`YUV420P buffer too small: expected ${sizes.totalSize} bytes, got ${buffer.length}`
		);
		return null;
	}

	return {
		yPlane: buffer.subarray(0, sizes.ySize),
		uPlane: buffer.subarray(sizes.ySize, sizes.ySize + sizes.uSize),
		vPlane: buffer.subarray(sizes.ySize + sizes.uSize, sizes.totalSize),
	};
}

// =============================================================================
// Protocol Constants
// =============================================================================

/**
 * 媒体协议版本
 */
export const MEDIA_PROTOCOL_VERSION = '1.0.0';

/**
 * 请求超时时间（毫秒）- 分层超时
 */
/** 播放帧超时 - 关键路径，必须快速响应 */
export const PLAYBACK_REQUEST_TIMEOUT = 5000; // 5 seconds
/** 预加载超时 - 后台任务，允许更长时间 */
export const PRELOAD_REQUEST_TIMEOUT = 15000; // 15 seconds
/** 媒体探测超时 - 一次性操作 */
export const PROBE_REQUEST_TIMEOUT = 10000; // 10 seconds
/** 默认超时（向后兼容） */
export const MEDIA_REQUEST_TIMEOUT = 30000; // 30 seconds (for slow FFmpeg decode)

/**
 * 最大并发请求数
 * 增加到 6 以支持更流畅的播放
 */
export const MAX_CONCURRENT_REQUESTS = 6;

// =============================================================================
// Preload Cache Configuration - 预加载缓存配置
// =============================================================================

/**
 * 自适应缓存层次结构：
 *
 * 缓存策略：
 * - 缓存范围：1×窗口 ~ 2×窗口
 * - 当缓存 <= 1×窗口时触发预加载
 * - 预加载后恢复到 2×窗口
 *
 * 默认配置：
 * - Timeline Window: 3s
 * - Webview Cache: 6s (180 帧 @ 30fps) = 2×窗口
 * - Extension Cache: 100MB LRU
 */

/**
 * 默认时间窗口（秒）- 预加载的基础时间单位
 * - 用于触发预加载的阈值计算（缓存 <= 1×窗口时触发）
 * - 用于视频元素检测范围扩展
 */
export const PRELOAD_TIME_WINDOW = 3;

/**
 * 缓存窗口倍数
 * - Webview 缓存 = 时间窗口 × 此倍数
 * - 保证缓存范围在 1×窗口 ~ 2×窗口 之间
 */
export const CACHE_WINDOW_MULTIPLIER = 2;

/**
 * 每个视频的最大预加载帧数（Webview 端）
 * - 2×窗口 @ 30fps = 6s = 180 帧
 * - 限制单个视频的内存占用
 */
export const MAX_PRELOAD_FRAMES_PER_VIDEO = PRELOAD_TIME_WINDOW * CACHE_WINDOW_MULTIPLIER * 30;

/**
 * 全局帧缓存限制（Webview 端）
 * - 180 帧 × 8MB (1080p) ≈ 1.4GB（单视频最大）
 * - 跨所有视频的总帧数限制
 * - 略大于单视频限制，允许多视频重叠缓存
 */
export const GLOBAL_FRAME_CACHE_LIMIT = Math.ceil(MAX_PRELOAD_FRAMES_PER_VIDEO * 1.2);

/**
 * Extension 端缓存大小限制（字节）
 *
 * Phase 4 更新：扩大到 200MB
 * - 合并原 FFmpegService.frameCache (100MB) 和 MediaCacheService.decodedFrameCache
 * - JPEG 压缩帧（q=3, ~50KB/帧 for 1080p）
 * - 约 4000 帧容量，约 130+ 秒 @ 30fps
 * - 按帧大小动态管理，而非固定帧数
 */
export const EXTENSION_CACHE_SIZE_BYTES = 200 * 1024 * 1024;

/**
 * Extension 端缓存统计信息接口
 */
export interface ExtensionCacheStats {
  /** 当前缓存大小（字节） */
  currentSizeBytes: number;
  /** 最大缓存大小（字节） */
  maxSizeBytes: number;
  /** 缓存帧数 */
  frameCount: number;
  /** 缓存命中次数 */
  hitCount: number;
  /** 缓存未命中次数 */
  missCount: number;
  /** 缓存命中率 */
  hitRate: number;
  /** 缓存的视频数量 */
  videoCount: number;
}

// =============================================================================
// Media Engine Protocol (Progressive Architecture)
// =============================================================================

/**
 * Media engine mode
 */
export type MediaEngineModeType = 'basic' | 'compatible' | 'auto';

/**
 * Download state for compatible mode
 */
export type DownloadStateType = 'idle' | 'downloading' | 'extracting' | 'verifying' | 'completed' | 'error';

/**
 * Get current media engine mode request
 */
export interface GetMediaEngineModeRequest extends BaseMediaRequest {
	type: 'mediaEngine:getMode';
}

/**
 * Get current media engine mode response
 */
export interface GetMediaEngineModeResponse extends BaseMediaResponse {
	type: 'mediaEngine:response:getMode';
	payload?: {
		/** Current active mode */
		currentMode: MediaEngineModeType | null;
		/** Whether compatible mode is installed */
		compatibleModeInstalled: boolean;
		/** Recommended mode for current context */
		recommendedMode?: MediaEngineModeType;
	};
}

/**
 * Set media engine mode request
 */
export interface SetMediaEngineModeRequest extends BaseMediaRequest {
	type: 'mediaEngine:setMode';
	payload: {
		/** Mode to set */
		mode: MediaEngineModeType;
	};
}

/**
 * Set media engine mode response
 */
export interface SetMediaEngineModeResponse extends BaseMediaResponse {
	type: 'mediaEngine:response:setMode';
	payload?: {
		/** Whether mode was set successfully */
		success: boolean;
		/** New active mode */
		activeMode: MediaEngineModeType;
	};
}

/**
 * Get download status request
 */
export interface GetDownloadStatusRequest extends BaseMediaRequest {
	type: 'mediaEngine:getDownloadStatus';
}

/**
 * Get download status response
 */
export interface GetDownloadStatusResponse extends BaseMediaResponse {
	type: 'mediaEngine:response:getDownloadStatus';
	payload?: {
		/** Whether compatible mode is installed */
		installed: boolean;
		/** Installed version */
		version?: string;
		/** Installed size in bytes */
		size?: number;
		/** Current download state */
		state: DownloadStateType;
		/** Download progress (0-100) */
		progress?: number;
		/** Error message if state is error */
		error?: string;
	};
}

/**
 * Start download request
 */
export interface StartDownloadRequest extends BaseMediaRequest {
	type: 'mediaEngine:startDownload';
}

/**
 * Start download response
 */
export interface StartDownloadResponse extends BaseMediaResponse {
	type: 'mediaEngine:response:startDownload';
	payload?: {
		/** Whether download started successfully */
		started: boolean;
	};
}

/**
 * Download progress notification (Extension → Webview push)
 */
export interface DownloadProgressNotification {
	type: 'mediaEngine:downloadProgress';
	payload: {
		/** Download progress (0-100) */
		progress: number;
		/** Current state */
		state: DownloadStateType;
		/** Downloaded bytes */
		downloadedBytes?: number;
		/** Total bytes */
		totalBytes?: number;
	};
}

/**
 * Download complete notification (Extension → Webview push)
 */
export interface DownloadCompleteNotification {
	type: 'mediaEngine:downloadComplete';
	payload: {
		/** Whether download succeeded */
		success: boolean;
		/** Error message if failed */
		error?: string;
		/** Installed version */
		version?: string;
	};
}

/**
 * Analyze media for mode recommendation request
 */
export interface AnalyzeMediaRequest extends BaseMediaRequest {
	type: 'mediaEngine:analyzeMedia';
	payload: {
		/** Media file path */
		videoPath: string;
	};
}

/**
 * Analyze media response
 */
export interface AnalyzeMediaResponse extends BaseMediaResponse {
	type: 'mediaEngine:response:analyzeMedia';
	payload?: {
		/** Media information */
		mediaInfo: MediaInfo;
		/** Recommended mode */
		recommendedMode: MediaEngineModeType;
		/** Reason for recommendation */
		reason: string;
		/** Whether download is required */
		requiresDownload: boolean;
		/** Download size if required */
		downloadSize?: number;
		/** Unsupported features in basic mode */
		unsupportedFeatures?: string[];
	};
}

/**
 * All media engine request types
 */
export type MediaEngineRequest =
	| GetMediaEngineModeRequest
	| SetMediaEngineModeRequest
	| GetDownloadStatusRequest
	| StartDownloadRequest
	| AnalyzeMediaRequest;

/**
 * All media engine response types
 */
export type MediaEngineResponse =
	| GetMediaEngineModeResponse
	| SetMediaEngineModeResponse
	| GetDownloadStatusResponse
	| StartDownloadResponse
	| AnalyzeMediaResponse;

/**
 * All media engine notification types (push from Extension)
 */
export type MediaEngineNotification =
	| DownloadProgressNotification
	| DownloadCompleteNotification;

// =============================================================================
// Compatible Mode Rendering Protocol (Extension-side rendering for preview)
// =============================================================================

/**
 * Base media request type (for compatible mode requests)
 */
interface BaseMediaRequest {
	/** Request ID for matching response */
	requestId: string;
	/** Request timestamp */
	timestamp: number;
}

/**
 * Composite layer configuration for Extension-side rendering
 */
export interface CompositeLayerConfig {
	/** Video/image file path */
	source: string;
	/** Source media time point (seconds) */
	sourceTime: number;
	/** Transform settings */
	transform: {
		/** X position (pixels) */
		x: number;
		/** Y position (pixels) */
		y: number;
		/** X scale factor (1.0 = original) */
		scaleX: number;
		/** Y scale factor (1.0 = original) */
		scaleY: number;
		/** Rotation in degrees */
		rotation: number;
		/** Anchor X (0-1, default 0.5 = center) */
		anchorX: number;
		/** Anchor Y (0-1, default 0.5 = center) */
		anchorY: number;
	};
	/** Opacity (0-1) */
	opacity: number;
	/** Z-index for ordering (higher = on top) */
	zIndex: number;
}

/**
 * Render composite frame request (Compatible mode)
 * Extension端使用 FFmpeg + wgpu 合成多层并返回渲染结果
 */
export interface RenderCompositeFrameRequest extends BaseMediaRequest {
	type: 'media:renderCompositeFrame';
	payload: {
		/** Layers to composite (ordered by zIndex) */
		layers: CompositeLayerConfig[];
		/** Timeline time point (seconds) */
		time: number;
		/** Output width in pixels */
		width: number;
		/** Output height in pixels */
		height: number;
		/** Background color RGBA (0-255) */
		backgroundColor?: [number, number, number, number];
	};
}

/**
 * Render composite frame response
 */
export interface RenderCompositeFrameResponse {
	requestId: string;
	type: 'media:response:renderCompositeFrame';
	error?: string;
	payload?: {
		/** Binary JPEG data (preferred, more efficient) */
		imageData?: Uint8Array;
		/** Rendered image as base64 data URL (legacy fallback) */
		imageDataUrl?: string;
		/** Image width */
		width: number;
		/** Image height */
		height: number;
	};
}

/**
 * Get single video frame request (Compatible mode)
 * For compatible mode preview - Extension端解码单帧
 */
export interface CompatibleGetVideoFrameRequest extends BaseMediaRequest {
	type: 'media:compatibleGetVideoFrame';
	payload: {
		/** Video file path */
		videoPath: string;
		/** Time point (seconds) */
		timeInSeconds: number;
		/** Output width (optional, use original if not specified) */
		width?: number;
		/** Output height (optional, use original if not specified) */
		height?: number;
	};
}

/**
 * Get single video frame response (Compatible mode)
 */
export interface CompatibleGetVideoFrameResponse {
	requestId: string;
	type: 'media:response:compatibleGetVideoFrame';
	error?: string;
	payload?: {
		/** Frame image as binary JPEG data (preferred, more efficient) */
		imageData?: Uint8Array;
		/** Frame image as base64 data URL (legacy fallback) */
		imageDataUrl?: string;
		/** Frame width */
		width: number;
		/** Frame height */
		height: number;
	};
}

/**
 * All compatible mode request types
 */
export type CompatibleModeRequest =
	| RenderCompositeFrameRequest
	| CompatibleGetVideoFrameRequest;

/**
 * All compatible mode response types
 */
export type CompatibleModeResponse =
	| RenderCompositeFrameResponse
	| CompatibleGetVideoFrameResponse;

// =============================================================================
// Pull Mode Protocol (RAF-driven frame pulling for backpressure control)
// =============================================================================

/**
 * Webview → Extension: Signal that webview is ready to receive a frame.
 * Sent on each requestAnimationFrame cycle when a frame is needed.
 */
export interface PullModeReadyRequest {
	type: 'media:pullMode:ready';
	requestId: string;
	timestamp: number;
	payload: {
		/** Pull session ID */
		sessionId: string;
		/** Video file path */
		videoPath: string;
		/** Requested time point (seconds) */
		timeInSeconds: number;
		/** Output width (optional) */
		width?: number;
		/** Output height (optional) */
		height?: number;
	};
}

/**
 * Extension → Webview: Frame data response for pull mode.
 * Sent only after receiving a READY signal.
 */
export interface PullModeFrameResponse {
	requestId: string;
	type: 'media:pullMode:frame';
	payload?: {
		/** Pull session ID */
		sessionId: string;
		/** Frame time point (seconds) */
		timeInSeconds: number;
		/** Frame image data (binary JPEG) */
		imageData: Uint8Array;
		/** Frame width */
		width: number;
		/** Frame height */
		height: number;
	};
	error?: string;
}

/**
 * Webview → Extension: Start or stop a pull mode session.
 */
export interface PullModeControlRequest {
	type: 'media:pullMode:start' | 'media:pullMode:stop';
	requestId: string;
	timestamp: number;
	payload: {
		/** Pull session ID */
		sessionId: string;
		/** Video file path (required for 'start') */
		videoPath?: string;
	};
}

/**
 * Extension → Webview: Acknowledgment for pull mode control requests.
 */
export interface PullModeControlResponse {
	requestId: string;
	type: 'media:pullMode:started' | 'media:pullMode:stopped';
	payload: {
		/** Pull session ID */
		sessionId: string;
	};
	error?: string;
}

/**
 * Union type for all pull mode messages from Webview to Extension
 */
export type PullModeWebviewMessage =
	| PullModeReadyRequest
	| PullModeControlRequest;

/**
 * Union type for all pull mode messages from Extension to Webview
 */
export type PullModeExtensionMessage =
	| PullModeFrameResponse
	| PullModeControlResponse;

// =============================================================================
// Frame Server Protocol (Localhost Server Approach)
// =============================================================================

/**
 * Webview → Extension: Request to start frame server for a video
 */
export interface FrameServerStartRequest {
	type: 'media:frameServer:start';
	requestId: string;
	timestamp: number;
	payload: {
		/** Session ID for this frame server */
		sessionId: string;
		/** Video file path */
		videoPath: string;
		/** Preferred streaming mode */
		mode?: 'websocket' | 'mjpeg';
	};
}

/**
 * Extension → Webview: Frame server started response
 */
export interface FrameServerStartedResponse {
	type: 'media:frameServer:started';
	requestId: string;
	payload: {
		/** Session ID */
		sessionId: string;
		/** Server port */
		port: number;
		/** WebSocket URL */
		websocketUrl: string;
		/** MJPEG URL */
		mjpegUrl: string;
		/** Single frame URL */
		frameUrl: string;
	};
	error?: string;
}

/**
 * Webview → Extension: Request to stop frame server
 */
export interface FrameServerStopRequest {
	type: 'media:frameServer:stop';
	requestId: string;
	timestamp: number;
	payload: {
		/** Session ID */
		sessionId: string;
	};
}

/**
 * Extension → Webview: Frame server stopped response
 */
export interface FrameServerStoppedResponse {
	type: 'media:frameServer:stopped';
	requestId: string;
	payload: {
		/** Session ID */
		sessionId: string;
	};
	error?: string;
}

/**
 * Webview → Extension: Request frame at specific time (via frame server)
 * This triggers the Extension to decode and push the frame to the server
 */
export interface FrameServerPushRequest {
	type: 'media:frameServer:push';
	requestId: string;
	timestamp: number;
	payload: {
		/** Session ID */
		sessionId: string;
		/** Video file path */
		videoPath: string;
		/** Time in seconds */
		timeInSeconds: number;
	};
}

/**
 * Union type for frame server messages from Webview to Extension
 */
export type FrameServerWebviewMessage =
	| FrameServerStartRequest
	| FrameServerStopRequest
	| FrameServerPushRequest
	| FrameServerPlaybackStartRequest
	| FrameServerPlaybackStopRequest;

/**
 * Union type for frame server messages from Extension to Webview
 */
export type FrameServerExtensionMessage =
	| FrameServerStartedResponse
	| FrameServerStoppedResponse;

// =============================================================================
// Frame Server Playback Control (Push Mode)
// =============================================================================

/**
 * Webview → Extension: Start continuous frame pushing for playback
 * Extension will push frames at the specified FPS without waiting for requests
 */
export interface FrameServerPlaybackStartRequest {
	type: 'media:frameServer:playback:start';
	requestId: string;
	timestamp: number;
	payload: {
		/** Video file path */
		videoPath: string;
		/** Start time in seconds */
		startTime: number;
		/** Target FPS */
		fps: number;
		/** Playback speed (1.0 = normal) */
		speed?: number;
	};
}

/**
 * Webview → Extension: Stop continuous frame pushing
 */
export interface FrameServerPlaybackStopRequest {
	type: 'media:frameServer:playback:stop';
	requestId: string;
	timestamp: number;
	payload: {
		/** Video file path */
		videoPath: string;
	};
}

// =============================================================================
// Audio Streaming Protocol (Compat Mode Real-time Audio)
// =============================================================================

/**
 * Webview → Extension: Start audio streaming for project playback
 * Extension will decode and mix audio, then stream PCM data via WebSocket
 */
export interface AudioStreamStartRequest {
	type: 'media:audioStream:start';
	requestId: string;
	timestamp: number;
	payload: {
		/** Session ID for this audio stream */
		sessionId: string;
		/** Start time in seconds */
		startTime: number;
		/** Total duration in seconds */
		duration: number;
		/** Sample rate (default 48000) */
		sampleRate?: number;
		/** Number of channels (default 2) */
		channels?: number;
	};
}

/**
 * Extension → Webview: Audio stream started response
 */
export interface AudioStreamStartedResponse {
	type: 'media:audioStream:started';
	requestId: string;
	payload: {
		/** Session ID */
		sessionId: string;
		/** WebSocket URL for audio data */
		websocketUrl: string;
		/** Sample rate */
		sampleRate: number;
		/** Number of channels */
		channels: number;
	};
	error?: string;
}

/**
 * Webview → Extension: Stop audio streaming
 */
export interface AudioStreamStopRequest {
	type: 'media:audioStream:stop';
	requestId: string;
	timestamp: number;
	payload: {
		/** Session ID */
		sessionId: string;
	};
}

/**
 * Extension → Webview: Audio stream stopped response
 */
export interface AudioStreamStoppedResponse {
	type: 'media:audioStream:stopped';
	requestId: string;
	payload: {
		/** Session ID */
		sessionId: string;
	};
	error?: string;
}

/**
 * Webview → Extension: Seek audio stream to new position
 */
export interface AudioStreamSeekRequest {
	type: 'media:audioStream:seek';
	requestId: string;
	timestamp: number;
	payload: {
		/** Session ID */
		sessionId: string;
		/** New time position in seconds */
		timeInSeconds: number;
	};
}

/**
 * Extension → Webview: Audio data chunk (pushed via postMessage for simplicity)
 * For high-performance, use WebSocket instead
 */
export interface AudioStreamDataNotification {
	type: 'media:audioStream:data';
	payload: {
		/** Session ID */
		sessionId: string;
		/** PCM audio data (Float32Array, interleaved stereo) */
		pcmData: Float32Array;
		/** Timestamp in seconds */
		timestamp: number;
		/** Sample rate */
		sampleRate: number;
		/** Number of channels */
		channels: number;
	};
}

/**
 * Union type for audio stream messages from Webview to Extension
 */
export type AudioStreamWebviewMessage =
	| AudioStreamStartRequest
	| AudioStreamStopRequest
	| AudioStreamSeekRequest;

/**
 * Union type for audio stream messages from Extension to Webview
 */
export type AudioStreamExtensionMessage =
	| AudioStreamStartedResponse
	| AudioStreamStoppedResponse
	| AudioStreamDataNotification;

// =============================================================================
// Performance Stats Protocol (Compat Mode Monitoring)
// =============================================================================

/**
 * Extension performance statistics for compat mode
 * Sent periodically from Extension to Webview during playback
 */
export interface ExtensionPerformanceStats {
	/** CPU usage percentage (0-100) */
	cpuUsage: number;
	/** Memory usage in MB */
	memoryUsedMB: number;
	/** Total memory in MB */
	memoryTotalMB: number;
	/** Number of cached frames in Extension */
	cachedFrames: number;
	/** Cache hit count */
	cacheHitCount: number;
	/** Cache miss count */
	cacheMissCount: number;
	/** Cache hit rate (0-100) */
	cacheHitRate: number;
	/** Number of dropped frames */
	droppedFrames: number;
	/** Number of decode errors */
	decodeErrors: number;
	/** Average decode time in ms */
	avgDecodeTimeMs: number;
	/** Average render time in ms (wgpu composite) */
	avgRenderTimeMs: number;
}

/**
 * Media bitrate information
 */
export interface MediaBitrateInfo {
	/** Video bitrate in bps */
	videoBitrate: number;
	/** Audio bitrate in bps */
	audioBitrate: number;
	/** Total bitrate in bps */
	totalBitrate: number;
	/** Formatted video bitrate string (e.g., "10 Mbps") */
	videoBitrateStr: string;
	/** Formatted total bitrate string */
	totalBitrateStr: string;
}

/**
 * Webview → Extension: Request performance stats
 */
export interface GetPerformanceStatsRequest {
	type: 'media:getPerformanceStats';
	requestId: string;
	timestamp: number;
}

/**
 * Extension → Webview: Performance stats response
 */
export interface GetPerformanceStatsResponse {
	type: 'media:response:getPerformanceStats';
	requestId: string;
	payload?: ExtensionPerformanceStats;
	error?: string;
}

/**
 * Extension → Webview: Performance stats notification (pushed periodically)
 */
export interface PerformanceStatsNotification {
	type: 'media:performanceStats';
	payload: ExtensionPerformanceStats;
}

/**
 * Webview → Extension: Request media bitrate info
 */
export interface GetMediaBitrateRequest {
	type: 'media:getMediaBitrate';
	requestId: string;
	timestamp: number;
	payload: {
		/** Media file path */
		mediaPath: string;
	};
}

/**
 * Extension → Webview: Media bitrate response
 */
export interface GetMediaBitrateResponse {
	type: 'media:response:getMediaBitrate';
	requestId: string;
	payload?: MediaBitrateInfo;
	error?: string;
}
