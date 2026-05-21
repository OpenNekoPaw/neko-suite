import { describe, expect, it } from 'vitest';
import type { EditOperation } from '@neko/shared';
import { deriveAiOperationAffectedEntities } from './aiOperationFeedback';

describe('deriveAiOperationAffectedEntities', () => {
  it('extracts affected track, clip, and effect IDs from batch operations', () => {
    const operation: EditOperation = {
      type: 'batch',
      meta: { id: 'ai-op-1', timestamp: 1, source: 'ai' },
      payload: {
        operations: [
          {
            type: 'element.update',
            meta: { id: 'child-1', timestamp: 1, source: 'ai' },
            payload: {
              trackId: 'track-1',
              elementId: 'clip-1',
              updates: { startTime: 2 },
            },
            before: { updates: { startTime: 1 } },
          },
          {
            type: 'track.mix.effect.update',
            meta: { id: 'child-2', timestamp: 1, source: 'ai' },
            payload: {
              trackId: 'track-2',
              effectId: 'fx-1',
              updates: { enabled: false },
            },
            before: { updates: { enabled: true } },
          },
        ],
      },
    };

    expect(deriveAiOperationAffectedEntities(operation)).toEqual({
      trackIds: ['track-1', 'track-2'],
      elementIds: ['clip-1'],
      effectIds: ['fx-1'],
    });
  });

  it('extracts effect IDs from automation target changes', () => {
    const operation: EditOperation = {
      type: 'track.mix.setAutomation',
      meta: { id: 'ai-op-2', timestamp: 1, source: 'ai' },
      payload: {
        trackId: 'track-1',
        automation: [
          {
            id: 'lane-1',
            enabled: true,
            target: { kind: 'effect-param', effectId: 'fx-2', param: 'threshold' },
            points: [{ ticks: 0, value: -24, curve: 'linear' }],
          },
        ],
      },
      before: {},
    };

    expect(deriveAiOperationAffectedEntities(operation)).toEqual({
      trackIds: ['track-1'],
      elementIds: [],
      effectIds: ['fx-2'],
    });
  });
});
