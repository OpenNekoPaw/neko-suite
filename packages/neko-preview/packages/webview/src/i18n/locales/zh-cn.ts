/**
 * Chinese (Simplified) translations for neko-preview webview
 */
import type { MessageBundle } from '@neko/shared';

const preview: MessageBundle = {
  // Video player
  'preview.video.loading': '正在加载视频...',
  'preview.video.error': '错误：{error}',
  'preview.video.noMediaInfo': '无媒体信息',
  'preview.video.pipActive': '正在画中画播放',
  'preview.video.pauseButton': '暂停 (空格)',
  'preview.video.playButton': '播放 (空格)',
  'preview.video.mute': '静音',
  'preview.video.unmute': '取消静音',
  'preview.video.volumeLabel': '音量：{percent}%',
  'preview.video.speedLabel': '播放速度',
  'preview.video.showStats': '显示统计 (D)',
  'preview.video.hideStats': '隐藏统计 (D)',
  'preview.video.pipButton': '画中画',
  'preview.video.exitPip': '退出画中画',
  'preview.video.disconnected': '已断开',
  // Audio player
  'preview.audio.loading': '正在加载音频...',
  'preview.audio.error': '错误：{error}',
  'preview.audio.noMediaInfo': '无媒体信息',
  'preview.audio.defaultFilename': '音频文件',
  'preview.audio.unknownCodec': '未知',
  'preview.audio.mono': '单声道',
  'preview.audio.stereo': '立体声',
  'preview.audio.pauseButton': '暂停 (空格)',
  'preview.audio.playButton': '播放 (空格)',
  'preview.audio.mute': '静音',
  'preview.audio.unmute': '取消静音',
  'preview.audio.volumeLabel': '音量：{percent}%',
};

export const bundles: Record<string, MessageBundle> = {
  preview,
};
