/**
 * Audio Detection Utilities
 * 音频检测工具
 *
 * 使用 Extension FFmpeg probe 检测视频文件是否包含音轨
 */

import { getMediaProxy } from '../services/mediaProxyFactory';

// =============================================================================
// 类型定义
// =============================================================================

/** 视频音频信息 */
export interface VideoAudioInfo {
  /** 是否包含音轨 */
  hasAudio: boolean;
  /** 音频通道数 */
  channels: number;
  /** 音频时长（秒） */
  duration: number;
  /** 采样率 */
  sampleRate: number;
}

// =============================================================================
// 音频检测函数
// =============================================================================

/**
 * 检测视频文件是否包含音轨
 *
 * 使用 Extension FFmpeg probe 检测，比 HTML5 Video 更可靠
 *
 * @param src - 视频文件路径（非 webview URI）
 * @returns 是否包含音轨
 */
export async function detectVideoHasAudio(src: string): Promise<boolean> {
  try {
    const info = await getVideoAudioInfo(src);
    return info.hasAudio;
  } catch (error) {
    console.error('[detectVideoHasAudio] Failed:', error);
    // 降级策略：根据文件扩展名判断
    return isLikelyVideoFile(src);
  }
}

/**
 * 获取视频音频详细信息
 *
 * 使用 Extension FFmpeg probe 获取媒体信息
 *
 * @param src - 视频文件路径（非 webview URI）
 * @returns 音频信息
 */
export async function getVideoAudioInfo(src: string): Promise<VideoAudioInfo> {
  try {
    // Use FFmpeg probe to get media info
    const mediaInfo = await getMediaProxy().probeMediaInfo(src, {
      timeoutMs: 10000,
    });

    return {
      hasAudio: mediaInfo.hasAudio,
      channels: mediaInfo.audioChannels ?? 0,
      duration: mediaInfo.duration,
      sampleRate: mediaInfo.audioSampleRate ?? 0,
    };
  } catch (error) {
    console.error('[getVideoAudioInfo] FFmpeg probe failed:', error);
    // Return default info (no audio)
    return {
      hasAudio: false,
      channels: 0,
      duration: 0,
      sampleRate: 0,
    };
  }
}

/**
 * 根据文件扩展名判断是否可能是视频文件
 *
 * @param src - 文件路径
 * @returns 是否可能是视频文件
 */
function isLikelyVideoFile(src: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv', '.flv', '.wmv'];
  const lowerSrc = src.toLowerCase();
  return videoExtensions.some(ext => lowerSrc.endsWith(ext));
}

/**
 * 判断文件是否为音频文件
 *
 * @param src - 文件路径
 * @returns 是否为音频文件
 */
export function isAudioFile(src: string): boolean {
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus'];
  const lowerSrc = src.toLowerCase();
  return audioExtensions.some(ext => lowerSrc.endsWith(ext));
}

/**
 * 判断文件是否为视频文件
 *
 * @param src - 文件路径
 * @returns 是否为视频文件
 */
export function isVideoFile(src: string): boolean {
  return isLikelyVideoFile(src);
}
