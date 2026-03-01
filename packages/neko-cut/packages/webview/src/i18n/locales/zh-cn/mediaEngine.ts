import type { MessageBundle } from '@neko/shared';

export const mediaEngine = {
  'mediaEngine.mode.basic': '基础',
  'mediaEngine.mode.compatible': '兼容',
  'mediaEngine.mode.basicTooltip': 'WebCodecs + libav.js (Webview)',
  'mediaEngine.mode.compatibleTooltip': '原生 FFmpeg + wgpu (Extension)',

  'mediaEngine.preference.auto': '自动',
  'mediaEngine.preference.basic': '基础',
  'mediaEngine.preference.compatible': '兼容',
  'mediaEngine.preference.autoDesc': '根据媒体格式自动选择最佳模式',
  'mediaEngine.preference.basicDesc': '使用轻量模式 (WebCodecs + libav.js)',
  'mediaEngine.preference.compatibleDesc': '使用全功能模式 (原生 FFmpeg)',

  'mediaEngine.settings.title': '媒体引擎',
  'mediaEngine.settings.mode': '模式',
  'mediaEngine.settings.preference': '模式偏好',
  'mediaEngine.settings.compatibleMode': '兼容模式',
  'mediaEngine.settings.downloadDescription': '下载额外组件以获得完整编解码支持',

  'mediaEngine.status.installed': '已安装',
  'mediaEngine.status.notInstalled': '未安装',
  'mediaEngine.status.version': '版本',

  'mediaEngine.action.download': '下载',

  'mediaEngine.downloadState.downloading': '下载中...',
  'mediaEngine.downloadState.extracting': '解压中...',
  'mediaEngine.downloadState.verifying': '验证中...',

  'mediaEngine.error.downloadFailed': '下载失败',

  'mediaEngine.recommendation.title': '建议切换模式',
  'mediaEngine.recommendation.unsupportedFeatures': '基础模式不支持',
  'mediaEngine.recommendation.continueBasic': '继续使用基础模式',
  'mediaEngine.recommendation.downloadAndSwitch': '下载并切换',
  'mediaEngine.recommendation.switchToCompatible': '切换到兼容模式',
} as const satisfies MessageBundle;
