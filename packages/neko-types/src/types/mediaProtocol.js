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
//# sourceMappingURL=mediaProtocol.js.map