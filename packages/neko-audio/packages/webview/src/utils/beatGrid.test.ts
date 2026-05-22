import { describe, expect, it } from 'vitest';
import type { AudioProjectData } from '@neko/shared';
import {
  formatSecondsAsBarBeat,
  getProjectBpm,
  getInitialBarDurationSeconds,
  getVisibleBarBeatLabels,
  snapSecondsToGrid,
} from './beatGrid';

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

  it('gets the initial bar duration for timeline grid alignment', () => {
    expect(getInitialBarDurationSeconds(project.tempoMap!)).toBe(2);
  });

  it('snaps seconds in tick space to nearest beat', () => {
    expect(
      snapSecondsToGrid(0.46, project.tempoMap!, { enabled: true, mode: 'beat' }),
    ).toBeCloseTo(0.5);
  });

  it('returns visible labels on bar starts only', () => {
    expect(
      getVisibleBarBeatLabels({
        tempoMap: project.tempoMap!,
        visibleStart: 0,
        visibleEnd: 8.1,
        scrollLeft: 0,
        pixelsPerSecond: 50,
      }),
    ).toEqual([
      { seconds: 0, label: '1:1:0' },
      { seconds: 2, label: '2:1:0' },
      { seconds: 4, label: '3:1:0' },
      { seconds: 6, label: '4:1:0' },
      { seconds: 8, label: '5:1:0' },
    ]);
  });

  it('returns raw seconds when grid is off', () => {
    expect(
      snapSecondsToGrid(0.46, project.tempoMap!, { enabled: false, mode: 'off' }),
    ).toBe(0.46);
  });
});
