import { describe, expect, it } from 'vitest';
import type { TempoMap } from '@neko/shared';
import { computeClipInteractionUpdates } from './useClipInteraction';

describe('computeClipInteractionUpdates', () => {
  const tempoMap: TempoMap = {
    ppq: 480,
    tempoEvents: [{ ticks: 0, bpm: 120 }],
    timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
  };

  it('snaps moved clip start to nearest beat', () => {
    const updates = computeClipInteractionUpdates(
      'move',
      46,
      100,
      { origStartTime: 0, origDuration: 2, origTrimStart: 0 },
      tempoMap,
      { enabled: true, mode: 'beat' },
    );

    expect(updates.startTime).toBeCloseTo(0.5);
  });
});
