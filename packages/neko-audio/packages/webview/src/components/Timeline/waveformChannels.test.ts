import { describe, expect, it } from 'vitest';
import { getWaveformChannels } from './waveformChannels';

describe('getWaveformChannels', () => {
  it('prefers stereo channel peaks when available', () => {
    const channels = getWaveformChannels({
      peaks: [0.5, 0.6],
      channelPeaks: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      duration: 1,
      sampleRate: 48000,
      channels: 2,
      peaksPerSecond: 10,
    });

    expect(channels).toEqual([
      { label: 'L', peaks: [0.1, 0.2] },
      { label: 'R', peaks: [0.3, 0.4] },
    ]);
  });

  it('falls back to downmixed peaks for legacy waveform data', () => {
    expect(
      getWaveformChannels({
        peaks: [0.5, 0.6],
        duration: 1,
        sampleRate: 48000,
      }),
    ).toEqual([{ label: 'Mix', peaks: [0.5, 0.6] }]);
  });
});
