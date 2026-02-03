/**
 * Export Protocol
 *
 * 定义 Webview 和 Extension 之间的导出 IPC 协议
 *
 * 职责：
 * - 定义导出请求/响应消息类型
 * - 定义导出配置和状态结构
 * - 保证类型安全的 IPC 通信
 */
/**
 * 默认导出设置
 */
export const DEFAULT_EXPORT_SETTINGS = {
    width: 960, // EMERGENCY FIX: Further reduce to 960 for complex projects
    height: 540, // EMERGENCY FIX: Further reduce to 540 for complex projects
    fps: 30,
    format: 'mp4',
    quality: 'high',
    hardwareAccel: false, // CRITICAL FIX: Disable HW accel to avoid VideoToolbox encoding bottleneck
    // CRITICAL FIX: Add default video bitrate based on resolution
    // For 960x540@30fps: ~2500 kbps is reasonable for high quality
    videoBitrate: 2500,
    audioBitrate: 192,
};
// =============================================================================
// Protocol Constants
// =============================================================================
/**
 * 导出协议版本
 */
export const EXPORT_PROTOCOL_VERSION = '1.0.0';
/**
 * 导出请求超时时间（毫秒）
 * 注意：这是启动导出的超时，不是导出完成的超时
 */
export const EXPORT_START_TIMEOUT = 30000; // 30 seconds
/**
 * 最大并发导出任务数
 */
export const MAX_CONCURRENT_EXPORTS = 1;
/**
 * FFmpeg 支持的特效映射
 */
export const FFMPEG_SUPPORTED_FEATURES = {
    /** 变换 */
    transforms: ['position', 'scale', 'rotation'],
    /** 混合模式（仅支持部分） */
    blendModes: ['normal', 'multiply', 'screen', 'overlay'],
    /** 颜色校正 */
    colorCorrection: ['brightness', 'contrast', 'saturation'],
    /** 转场（使用 xfade） */
    transitions: ['fade', 'dissolve', 'wipe', 'slide'],
    /** 不支持的特效 */
    unsupported: [
        'custom-shader',
        'motion-blur',
        'complex-mask',
        'advanced-blend-modes',
    ],
};
/**
 * 默认流式导出配置
 */
export const DEFAULT_STREAMING_EXPORT_SETTINGS = {
    ...DEFAULT_EXPORT_SETTINGS,
    mode: 'streaming',
    frameFormat: 'jpeg', // CRITICAL FIX: Use JPEG for 50x faster transfer (was 'rgba')
    maxPendingFrames: 100, // CRITICAL FIX: Increase from 30 to 100 for better throughput
};
/**
 * 默认背压配置
 */
export const DEFAULT_BACKPRESSURE_CONFIG = {
    pauseThreshold: 0.8, // Pause at 80% utilization (was 0.95)
    resumeThreshold: 0.4, // Resume at 40% utilization (was 0.5)
    maxPendingFrames: 50, // Buffer 50 frames (was 100) - reduced since encoding tracking is now accurate
    maxWaitTime: 30000,
};
// =============================================================================
// Protocol Version
// =============================================================================
/**
 * 流式导出协议版本
 */
export const STREAMING_EXPORT_PROTOCOL_VERSION = '2.0.0';
//# sourceMappingURL=exportProtocol.js.map