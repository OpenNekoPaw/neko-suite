// =============================================================================
// applyAudioOperation — 音频项目操作应用
// =============================================================================

import type { AudioOperation } from './types';
import { arrayMove } from './helpers';
import { OperationError } from './errors';

// Re-export AudioProjectData from its canonical location
export type { AudioProjectData } from '../types/audioProject';
import type { AudioProjectData } from '../types/audioProject';

// =============================================================================
// applyAudioOperation — operates on masterEffectsChain and markers
// =============================================================================

export function applyAudioOperation(data: AudioProjectData, op: AudioOperation): AudioProjectData {
  switch (op.type) {
    case 'audio.effect.add': {
      const idx = op.payload.index ?? data.masterEffectsChain.length;
      const chain = [...data.masterEffectsChain];
      chain.splice(idx, 0, op.payload.effect);
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.remove': {
      const chain = data.masterEffectsChain.filter((e) => e.id !== op.payload.effectId);
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.update': {
      const chain = data.masterEffectsChain.map((e) =>
        e.id === op.payload.effectId ? { ...e, ...op.payload.updates } : e,
      );
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.toggle': {
      const chain = data.masterEffectsChain.map((e) =>
        e.id === op.payload.effectId ? { ...e, enabled: !e.enabled } : e,
      );
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.setBpm': {
      if (op.payload.bpm === undefined) {
        const { bpm: _bpm, ...rest } = data;
        return rest;
      }
      return { ...data, bpm: op.payload.bpm };
    }

    case 'audio.effect.move': {
      if (data.masterEffectsChain[op.payload.fromIndex]?.id !== op.payload.effectId) {
        throw OperationError.invalidOperation(
          `Audio effect not found at index ${op.payload.fromIndex}: ${op.payload.effectId}`,
        );
      }
      return {
        ...data,
        masterEffectsChain: arrayMove(
          data.masterEffectsChain,
          op.payload.fromIndex,
          op.payload.toIndex,
        ),
      };
    }

    case 'audio.marker.add': {
      return { ...data, markers: [...data.markers, op.payload.marker] };
    }

    case 'audio.marker.remove': {
      return { ...data, markers: data.markers.filter((m) => m.id !== op.payload.markerId) };
    }

    case 'audio.marker.update': {
      const markers = data.markers.map((m) =>
        m.id === op.payload.markerId ? { ...m, ...op.payload.updates } : m,
      );
      return { ...data, markers };
    }

    default:
      throw OperationError.invalidOperation(
        `Unknown audio operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}
