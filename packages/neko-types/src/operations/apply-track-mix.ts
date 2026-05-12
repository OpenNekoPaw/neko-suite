// =============================================================================
// applyTrackMixOperation — persisted per-track audio mix operations
// =============================================================================

import type { AudioProjectData, AudioTrackMixState } from '../types/audioProject';
import type { OperationMeta, TrackMixOperation } from './types';
import { arrayMove, findTrack } from './helpers';
import { OperationError } from './errors';

const DEFAULT_TRACK_MIX_STATE: AudioTrackMixState = {
  volume: 1,
  pan: 0,
  solo: false,
  effectChain: [],
};

export function createDefaultTrackMixState(): AudioTrackMixState {
  return {
    volume: DEFAULT_TRACK_MIX_STATE.volume,
    pan: DEFAULT_TRACK_MIX_STATE.pan,
    solo: DEFAULT_TRACK_MIX_STATE.solo,
    effectChain: [],
  };
}

export function applyTrackMixOperation(
  data: AudioProjectData,
  op: TrackMixOperation,
): AudioProjectData {
  findTrack(data, op.payload.trackId);

  const current = data.trackMix?.[op.payload.trackId] ?? createDefaultTrackMixState();

  switch (op.type) {
    case 'track.mix.setVolume':
      assertFiniteRange('track mix volume', op.payload.volume, 0, 2);
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        volume: op.payload.volume,
      });

    case 'track.mix.setPan':
      assertFiniteRange('track mix pan', op.payload.pan, -1, 1);
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        pan: op.payload.pan,
      });

    case 'track.mix.setSolo':
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        solo: op.payload.solo,
      });

    case 'track.mix.effect.add': {
      const index = op.payload.index;
      const effectChain = [...current.effectChain];
      effectChain.splice(index, 0, op.payload.effect);
      return withTrackMixState(data, op.payload.trackId, { ...current, effectChain });
    }

    case 'track.mix.effect.remove': {
      const effectChain = current.effectChain.filter((effect) => effect.id !== op.payload.effectId);
      if (effectChain.length === current.effectChain.length) {
        throw OperationError.invalidOperation(`Track mix effect not found: ${op.payload.effectId}`);
      }
      return withTrackMixState(data, op.payload.trackId, { ...current, effectChain });
    }

    case 'track.mix.effect.update': {
      let didUpdate = false;
      const effectChain = current.effectChain.map((effect) => {
        if (effect.id !== op.payload.effectId) {
          return effect;
        }
        didUpdate = true;
        return { ...effect, ...op.payload.updates };
      });
      if (!didUpdate) {
        throw OperationError.invalidOperation(`Track mix effect not found: ${op.payload.effectId}`);
      }
      return withTrackMixState(data, op.payload.trackId, { ...current, effectChain });
    }

    case 'track.mix.effect.move':
      if (current.effectChain[op.payload.fromIndex]?.id !== op.payload.effectId) {
        throw OperationError.invalidOperation(
          `Track mix effect not found at index ${op.payload.fromIndex}: ${op.payload.effectId}`,
        );
      }
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        effectChain: arrayMove(current.effectChain, op.payload.fromIndex, op.payload.toIndex),
      });

    default:
      throw OperationError.invalidOperation(
        `Unknown track mix operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}

export function invertTrackMixOperation(
  op: TrackMixOperation,
  meta: OperationMeta,
): TrackMixOperation {
  switch (op.type) {
    case 'track.mix.setVolume':
      return {
        type: 'track.mix.setVolume',
        meta,
        payload: { trackId: op.payload.trackId, volume: op.before.volume },
        before: { volume: op.payload.volume },
      };

    case 'track.mix.setPan':
      return {
        type: 'track.mix.setPan',
        meta,
        payload: { trackId: op.payload.trackId, pan: op.before.pan },
        before: { pan: op.payload.pan },
      };

    case 'track.mix.setSolo':
      return {
        type: 'track.mix.setSolo',
        meta,
        payload: { trackId: op.payload.trackId, solo: op.before.solo },
        before: { solo: op.payload.solo },
      };

    case 'track.mix.effect.add':
      return {
        type: 'track.mix.effect.remove',
        meta,
        payload: { trackId: op.payload.trackId, effectId: op.payload.effect.id },
        before: {
          effect: op.payload.effect,
          index: op.payload.index,
        },
      };

    case 'track.mix.effect.remove':
      return {
        type: 'track.mix.effect.add',
        meta,
        payload: {
          trackId: op.payload.trackId,
          effect: op.before.effect,
          index: op.before.index,
        },
      };

    case 'track.mix.effect.update':
      return {
        type: 'track.mix.effect.update',
        meta,
        payload: {
          trackId: op.payload.trackId,
          effectId: op.payload.effectId,
          updates: op.before.updates,
        },
        before: { updates: op.payload.updates },
      };

    case 'track.mix.effect.move':
      return {
        type: 'track.mix.effect.move',
        meta,
        payload: {
          trackId: op.payload.trackId,
          effectId: op.payload.effectId,
          fromIndex: op.payload.toIndex,
          toIndex: op.payload.fromIndex,
        },
      };

    default:
      throw OperationError.invalidOperation(
        `Unknown track mix operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}

function assertFiniteRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw OperationError.invalidOperation(`${label} out of range [${min}, ${max}]: ${value}`);
  }
}

function withTrackMixState(
  data: AudioProjectData,
  trackId: string,
  state: AudioTrackMixState,
): AudioProjectData {
  return {
    ...data,
    trackMix: {
      ...(data.trackMix ?? {}),
      [trackId]: state,
    },
  };
}
