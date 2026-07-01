import type { AudioInfoMessage, AudioResponseMessage, WaveformDataMessage } from '@neko/shared';
import type { LoudnessResult } from '../stores/audioStore';
import { t } from '../i18n';

export interface AudioProtocolViewActions {
  setFileInfo(filePath: string | null, fileName: string, audioInfo: AudioInfoMessage | null): void;
  setWaveform(waveform: WaveformDataMessage): void;
  setStreamInfo(streamId: string, streamUrl: string): void;
  setSilenceRegions(regions: Array<{ start: number; end: number }>): void;
  setLoudness(loudness: LoudnessResult | null, requestId?: string | null): void;
  setLoudnessAnalysisUnavailable(requestId?: string | null): void;
  showToast(text: string, level?: 'info' | 'success' | 'error'): void;
}

function parseSilenceRegions(value: unknown): Array<{ start: number; end: number }> | null {
  if (!Array.isArray(value)) return null;
  const regions: Array<{ start: number; end: number }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const region = item as Record<string, unknown>;
    if (typeof region.start === 'number' && typeof region.end === 'number') {
      regions.push({ start: region.start, end: region.end });
    }
  }
  return regions;
}

function parseLoudness(value: Record<string, unknown>): LoudnessResult | null {
  if (
    typeof value.integratedLoudness === 'number' &&
    typeof value.truePeak === 'number' &&
    typeof value.loudnessRange === 'number'
  ) {
    return {
      integratedLoudness: value.integratedLoudness,
      truePeak: value.truePeak,
      loudnessRange: value.loudnessRange,
    };
  }
  return null;
}

export function handleAudioResponseMessage(
  message: AudioResponseMessage,
  actions: AudioProtocolViewActions,
): boolean {
  switch (message.type) {
    case 'audio:init':
      actions.setFileInfo(message.filePath, message.fileName, message.audioInfo);
      return true;

    case 'audio:waveform':
      actions.setWaveform(message.waveform);
      return true;

    case 'audio:playbackReady':
      actions.setStreamInfo(message.streamId, message.wsUrl);
      if (message.warnings?.length) {
        actions.showToast(message.warnings.join('\n'), 'info');
      }
      return true;

    case 'audio:trimResult':
      actions.showToast(
        message.success
          ? t('audio.toast.trimmed')
          : (message.error ?? t('audio.toast.trimError', { error: '' }).trim()),
        message.success ? 'success' : 'error',
      );
      return true;

    case 'audio:effectsResult':
      actions.showToast(
        message.success
          ? t('audio.toast.effectsSuccess')
          : (message.error ?? t('audio.toast.effectsError', { error: '' }).trim()),
        message.success ? 'success' : 'error',
      );
      return true;

    case 'audio:analysisResult':
      if (message.kind === 'silence') {
        const regions = parseSilenceRegions(message.result.regions);
        if (regions) actions.setSilenceRegions(regions);
      } else {
        const loudness = parseLoudness(message.result);
        if (loudness) {
          actions.setLoudness(loudness, message.requestId);
        } else {
          actions.setLoudnessAnalysisUnavailable(message.requestId);
        }
      }
      return true;

    case 'audio:exportResult':
      if (message.success) {
        const suffix = message.warnings?.length ? `\n${message.warnings.join('\n')}` : '';
        const text = message.outputPath
          ? t('audio.toast.exportSuccess', { path: message.outputPath })
          : t('audio.toast.exportSuccessNoPath');
        actions.showToast(`${text}${suffix}`, 'success');
      } else {
        actions.showToast(message.error ?? t('audio.toast.exportError'), 'error');
      }
      return true;

    case 'audio:recordingResult':
      if (!message.success && message.error) {
        actions.showToast(message.error, 'error');
      }
      return true;

    case 'audio:error':
      actions.setLoudnessAnalysisUnavailable(message.requestId);
      actions.showToast(message.error, 'error');
      return true;

    case 'audio:playbackResult':
      return true;

    default:
      return false;
  }
}
