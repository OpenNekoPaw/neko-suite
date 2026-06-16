import type { WaveformData } from '../../shared/types';

export interface WaveformChannel {
  label: string;
  peaks: number[];
}

export function getWaveformChannels(waveform?: WaveformData | null): WaveformChannel[] {
  if (!waveform) return [];

  const channelPeaks = normalizeChannelPeaks(waveform.channelPeaks);
  if (channelPeaks.length > 0) {
    return channelPeaks.map((peaks, index) => ({
      label: getChannelLabel(index, channelPeaks.length),
      peaks,
    }));
  }

  if (waveform.peaks.length === 0) return [];
  return [{ label: 'Mix', peaks: waveform.peaks }];
}

function normalizeChannelPeaks(channelPeaks: number[][] | undefined): number[][] {
  if (!channelPeaks) return [];
  return channelPeaks.filter((peaks) => peaks.length > 0);
}

function getChannelLabel(index: number, channelCount: number): string {
  if (channelCount === 1) return 'M';
  if (index === 0) return 'L';
  if (index === 1) return 'R';
  return `C${index + 1}`;
}
