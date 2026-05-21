import { describe, expect, it } from 'vitest';
import type { AudioProjectData } from '@neko/shared';
import { formatSecondsAsBarBeat, getProjectBpm, snapSecondsToGrid } from './beatGrid';

describe('beatGrid helpers', () => {
  const project: AudioProjectData = {
    version: '2.2',
    name: 'Beat Grid',
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
    bpm: 120,
    tempoMap: {
      ppq: 480,
      tempoEvents: [{ ticks: 0, bpm: 120 }],
      timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
    },
  };

  it('reads project BPM from tempoMap before legacy bpm', () => {
    expect(getProjectBpm({ ...project, bpm: 90 })).toBe(120);
  });

  it('formats seconds as bars beats and ticks', () => {
    expect(formatSecondsAsBarBeat(1, project.tempoMap!)).toBe('1:3:0');
  });

  it('snaps seconds in tick space to nearest beat', () => {
    expect(
      snapSecondsToGrid(0.46, project.tempoMap!, { enabled: true, mode: 'beat' }),
    ).toBeCloseTo(0.5);
  });

  it('returns raw seconds when grid is off', () => {
    expect(
      snapSecondsToGrid(0.46, project.tempoMap!, { enabled: false, mode: 'off' }),
    ).toBe(0.46);
  });
});
