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
    radius?: number;
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
export type MediaRequest = GetVideoFrameRequest | GetVideoFrameRangeRequest | DecodeAudioSegmentRequest | ProbeMediaInfoRequest | ExtractSubtitlesRequest;
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
            /** 帧图片数据 */
            imageBuffer: ArrayBuffer;
        }>;
        /** 图片 MIME 类型 */
        mimeType: string;
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
export type MediaResponse = GetVideoFrameResponse | GetVideoFrameRangeResponse | DecodeAudioSegmentResponse | ProbeMediaInfoResponse | ExtractSubtitlesResponse;
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
    /** 是否包含音频流 */
    hasAudio: boolean;
    /** 音频编码格式（如果有） */
    audioCodec?: string;
    /** 音频采样率（如果有） */
    audioSampleRate?: number;
    /** 音频声道数（如果有） */
    audioChannels?: number;
    /** 是否包含字幕流 */
    hasSubtitles: boolean;
    /** 字幕流信息列表 */
    subtitleStreams?: SubtitleStream[];
}
/**
 * 媒体协议版本
 */
export declare const MEDIA_PROTOCOL_VERSION = "1.0.0";
/**
 * 请求超时时间（毫秒）- 分层超时
 */
/** 播放帧超时 - 关键路径，必须快速响应 */
export declare const PLAYBACK_REQUEST_TIMEOUT = 5000;
/** 预加载超时 - 后台任务，允许更长时间 */
export declare const PRELOAD_REQUEST_TIMEOUT = 15000;
/** 媒体探测超时 - 一次性操作 */
export declare const PROBE_REQUEST_TIMEOUT = 10000;
/** 默认超时（向后兼容） */
export declare const MEDIA_REQUEST_TIMEOUT = 30000;
/**
 * 最大并发请求数
 * 增加到 6 以支持更流畅的播放
 */
export declare const MAX_CONCURRENT_REQUESTS = 6;
/**
 * 自适应缓存层次结构：
 *
 * 缓存策略：
 * - 缓存范围：1×窗口 ~ 2×窗口
 * - 当缓存 <= 1×窗口时触发预加载
 * - 预加载后恢复到 2×窗口
 *
 * 默认配置（Low 复杂度，1-2 轨道）：
 * - Timeline Window: 3s
 * - Webview Cache: 6s (180 帧 @ 30fps) = 2×窗口
 * - Extension Cache: 100MB LRU
 *
 * 自适应调整（由 AdaptiveQualityManager 控制）：
 * - Low (1-2轨):   3s 窗口 → 缓存 6s
 * - Medium (3-4轨): 2s 窗口 → 缓存 4s
 * - High (5+轨):   1.5s 窗口 → 缓存 3s
 *
 * 注意：这里定义的是默认值，实际值由 AdaptiveMediaConfig 动态调整
 */
/**
 * 默认时间窗口（秒）- 预加载的基础时间单位
 * - 用于触发预加载的阈值计算（缓存 <= 1×窗口时触发）
 * - 用于视频元素检测范围扩展
 * - 可被 AdaptiveQualityManager 动态调整为 1.5-3s
 */
export declare const PRELOAD_TIME_WINDOW = 3;
/**
 * 缓存窗口倍数
 * - Webview 缓存 = 时间窗口 × 此倍数
 * - 保证缓存范围在 1×窗口 ~ 2×窗口 之间
 */
export declare const CACHE_WINDOW_MULTIPLIER = 2;
/**
 * 每个视频的最大预加载帧数（Webview 端）
 * - 2×窗口 @ 30fps = 6s = 180 帧
 * - 限制单个视频的内存占用
 */
export declare const MAX_PRELOAD_FRAMES_PER_VIDEO: number;
/**
 * 全局帧缓存限制（Webview 端）
 * - 180 帧 × 8MB (1080p) ≈ 1.4GB（单视频最大）
 * - 跨所有视频的总帧数限制
 * - 略大于单视频限制，允许多视频重叠缓存
 */
export declare const GLOBAL_FRAME_CACHE_LIMIT: number;
/**
 * Extension 端缓存大小限制（字节）
 *
 * Phase 4 更新：扩大到 200MB
 * - 合并原 FFmpegService.frameCache (100MB) 和 MediaCacheService.decodedFrameCache
 * - JPEG 压缩帧（q=3, ~50KB/帧 for 1080p）
 * - 约 4000 帧容量，约 130+ 秒 @ 30fps
 * - 按帧大小动态管理，而非固定帧数
 */
export declare const EXTENSION_CACHE_SIZE_BYTES: number;
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
export type MediaEngineRequest = GetMediaEngineModeRequest | SetMediaEngineModeRequest | GetDownloadStatusRequest | StartDownloadRequest | AnalyzeMediaRequest;
/**
 * All media engine response types
 */
export type MediaEngineResponse = GetMediaEngineModeResponse | SetMediaEngineModeResponse | GetDownloadStatusResponse | StartDownloadResponse | AnalyzeMediaResponse;
/**
 * All media engine notification types (push from Extension)
 */
export type MediaEngineNotification = DownloadProgressNotification | DownloadCompleteNotification;
export {};
//# sourceMappingURL=mediaProtocol.d.ts.map