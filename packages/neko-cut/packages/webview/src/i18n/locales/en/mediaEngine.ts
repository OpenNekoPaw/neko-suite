import type { MessageBundle } from '@neko/shared';

export const mediaEngine = {
  'mediaEngine.mode.basic': 'Basic',
  'mediaEngine.mode.compatible': 'Compatible',
  'mediaEngine.mode.basicTooltip': 'WebCodecs + libav.js (Webview)',
  'mediaEngine.mode.compatibleTooltip': 'Native FFmpeg + wgpu (Extension)',

  'mediaEngine.preference.auto': 'Auto',
  'mediaEngine.preference.basic': 'Basic',
  'mediaEngine.preference.compatible': 'Compatible',
  'mediaEngine.preference.autoDesc': 'Automatically select the best mode based on media format',
  'mediaEngine.preference.basicDesc': 'Use lightweight mode (WebCodecs + libav.js)',
  'mediaEngine.preference.compatibleDesc': 'Use full-featured mode (Native FFmpeg)',

  'mediaEngine.settings.title': 'Media Engine',
  'mediaEngine.settings.mode': 'Mode',
  'mediaEngine.settings.preference': 'Mode Preference',
  'mediaEngine.settings.compatibleMode': 'Compatible Mode',
  'mediaEngine.settings.downloadDescription': 'Download additional components for full codec support',

  'mediaEngine.status.installed': 'Installed',
  'mediaEngine.status.notInstalled': 'Not Installed',
  'mediaEngine.status.version': 'Version',

  'mediaEngine.action.download': 'Download',

  'mediaEngine.downloadState.downloading': 'Downloading...',
  'mediaEngine.downloadState.extracting': 'Extracting...',
  'mediaEngine.downloadState.verifying': 'Verifying...',

  'mediaEngine.error.downloadFailed': 'Download failed',

  'mediaEngine.recommendation.title': 'Recommended Mode Change',
  'mediaEngine.recommendation.unsupportedFeatures': 'Unsupported in basic mode',
  'mediaEngine.recommendation.continueBasic': 'Continue with Basic',
  'mediaEngine.recommendation.downloadAndSwitch': 'Download & Switch',
  'mediaEngine.recommendation.switchToCompatible': 'Switch to Compatible',
} as const satisfies MessageBundle;
